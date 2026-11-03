import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { testDatabase } from "./platform/test-db.js";
import { ensureAccountUpgrade } from "./account-upgrade.js";
import { installBillingRoutes, verifySePaySignature, createBillingReminderWorker } from "./billing.js";
import { publicUser } from "./auth.js";
import { canAccessSchool } from "../js/platform/school-access.js";

function signature(secret, timestamp, rawBody) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(timestamp + "." + rawBody).digest("hex");
}

test("SePay HMAC uses timestamp plus exact raw request body and rejects stale/tampered payloads", () => {
  const secret = "billing-test-secret";
  const rawBody = '{"id":123,"content":"MAIHOCABCDEF01234567","transferAmount":50000}';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signed = signature(secret, timestamp, rawBody);
  assert.equal(verifySePaySignature({ rawBody, signature: signed, timestamp, secret }), true);
  assert.equal(verifySePaySignature({ rawBody: rawBody + " ", signature: signed, timestamp, secret }), false);
  assert.equal(verifySePaySignature({ rawBody, signature: signed, timestamp: String(Number(timestamp) - 600), secret }), false);
  assert.equal(verifySePaySignature({ rawBody, signature: signed, timestamp, secret: "wrong-secret" }), false);
});

test("Billing creates student and school orders, activates one Standard subscription per recipient and deduplicates SePay transaction IDs", async () => {
  const fixture = await testDatabase({ memoryOnly: true });
  const secret = "billing-integration-secret";
  const env = {
    SEPAY_ENABLED: "1",
    SEPAY_WEBHOOK_SECRET: secret,
    SEPAY_ACCOUNT_NUMBER: "0123456789",
    SEPAY_BANK_CODE: "VCB",
    SCHOOL_STANDARD_PRICE_VND: "50000",
    SCHOOL_STANDARD_DURATION_DAYS: "30",
    BILLING_ORDER_EXPIRE_MINUTES: "20",
  };
  let server;
  try {
    await ensureAccountUpgrade(fixture.db);
    const insertUser = async (name, email, role = "user", accountType = "external") => {
      const row = await fixture.db.query(
        "INSERT INTO users(name,email,password_hash,role,admin_level,account_type) VALUES($1,$2,'test-hash',$3,0,$4) RETURNING id",
        [name, email, role, accountType],
      );
      return Number(row.rows[0].id);
    };
    const oldPremiumId = await insertUser("Old Premium", "billing-old-premium@test.local", "user", "school");
    await fixture.db.prepare("UPDATE users SET school_plan=? WHERE id=?").run("premium", oldPremiumId);
    const oldPremiumPlan = publicUser({ id: oldPremiumId, role: "user", school_plan: "premium" });
    assert.equal(oldPremiumPlan.schoolPlan, "legacy", "retired Premium records map to grandfathered Legacy access");
    assert.equal(canAccessSchool(oldPremiumPlan), true);
    assert.equal(publicUser({ id: oldPremiumId, role: "user", school_plan: "standard", school_expires_at: new Date(Date.now() - 1000) }).schoolPlan, "none");
    const studentId = await insertUser("Student One", "billing-student-one@test.local");
    const schoolBuyerId = await insertUser("School Buyer", "billing-school-buyer@test.local", "teacher", "school");
    const studentTwoId = await insertUser("Student Two", "billing-student-two@test.local", "user", "school");
    const studentThreeId = await insertUser("Student Three", "billing-student-three@test.local", "user", "school");
    const school = (await fixture.db.query(
      "INSERT INTO schools(code,name) VALUES('BILLING-TEST','Billing test school') RETURNING id",
    )).rows[0];
    await fixture.db.query(
      "INSERT INTO school_memberships(school_id,user_id,role,status) VALUES($1,$2,'school_admin','active'),($1,$3,'student','active'),($1,$4,'student','active')",
      [school.id, schoolBuyerId, studentTwoId, studentThreeId],
    );

    const app = express();
    app.use(express.json({ verify(req, _res, buffer) { if (req.path === "/api/billing/sepay/webhook") req.rawBody = Buffer.from(buffer).toString("utf8"); } }));
    app.use((req, _res, next) => {
      const id = Number(req.get("x-test-user"));
      if (id === studentId) req.user = { id, role: "user", schoolPlan: "none" };
      if (id === schoolBuyerId) req.user = { id, role: "teacher", isTeacher: true, schoolPlan: "none" };
      next();
    });
    const requireAuth = (req, res, next) => req.user ? next() : res.sendStatus(401);
    const requireSameOrigin = (_req, _res, next) => next();
    installBillingRoutes(app, { db: fixture.db, requireAuth, requireSameOrigin, env });
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const origin = "http://127.0.0.1:" + server.address().port;
    const post = async (path, body, userId) => fetch(origin + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(userId ? { "X-Test-User": String(userId) } : {}) },
      body: JSON.stringify(body),
    });
    const sendWebhook = async (payload, idOverride) => {
      const rawBody = JSON.stringify(payload);
      const timestamp = String(Math.floor(Date.now() / 1000));
      return fetch(origin + "/api/billing/sepay/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SePay-Timestamp": timestamp,
          "X-SePay-Signature": signature(secret, timestamp, rawBody),
        },
        body: rawBody,
      });
    };

    const selfOrderResponse = await post("/api/billing/orders", { buyerType: "student" }, studentId);
    assert.equal(selfOrderResponse.status, 201);
    const selfOrder = (await selfOrderResponse.json()).order;
    assert.equal(selfOrder.amountVnd, 50000);
    assert.match(selfOrder.qrImageUrl, /vietqr\.app\/img/);

    const invalidSignature = await fetch(origin + "/api/billing/sepay/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-SePay-Timestamp": String(Math.floor(Date.now() / 1000)), "X-SePay-Signature": "sha256=" + "0".repeat(64) },
      body: JSON.stringify({ id: 111, transferType: "in", transferAmount: 50000, content: selfOrder.orderCode, accountNumber: env.SEPAY_ACCOUNT_NUMBER }),
    });
    assert.equal(invalidSignature.status, 401);

    const selfPayload = { id: 900001, gateway: "Vietcombank", accountNumber: env.SEPAY_ACCOUNT_NUMBER, transferType: "in", transferAmount: 50000, content: selfOrder.orderCode, referenceCode: "FT-BILLING-SELF" };
    const firstPayment = await sendWebhook(selfPayload);
    assert.equal(firstPayment.status, 200);
    assert.deepEqual(await firstPayment.json(), { success: true });
    await sendWebhook(selfPayload);
    const selfState = (await fixture.db.query(
      "SELECT school_plan,school_expires_at FROM users WHERE id=$1",
      [studentId],
    )).rows[0];
    assert.equal(selfState.school_plan, "standard");
    assert.ok(new Date(selfState.school_expires_at).getTime() > Date.now());
    const selfSubs = (await fixture.db.query("SELECT count(*)::int AS n FROM billing_subscriptions WHERE user_id=$1", [studentId])).rows[0];
    assert.equal(selfSubs.n, 1);
    const transactions = (await fixture.db.query("SELECT count(*)::int AS n FROM billing_transactions WHERE gateway_transaction_id='900001'")).rows[0];
    assert.equal(transactions.n, 1);

    const firstExpiry = new Date(selfState.school_expires_at).getTime();
    const renewalResponse = await post("/api/billing/orders", { buyerType: "student" }, studentId);
    assert.equal(renewalResponse.status, 201);
    const renewalOrder = (await renewalResponse.json()).order;
    const renewalPayment = await sendWebhook({
      id: 900003, gateway: "Vietcombank", accountNumber: env.SEPAY_ACCOUNT_NUMBER,
      transferType: "in", transferAmount: 50000, content: renewalOrder.orderCode,
      referenceCode: "FT-BILLING-RENEWAL",
    });
    assert.equal(renewalPayment.status, 200);
    const renewedState = (await fixture.db.query(
      "SELECT school_expires_at FROM users WHERE id=$1", [studentId],
    )).rows[0];
    assert.ok(new Date(renewedState.school_expires_at).getTime() >= firstExpiry + 29 * 86400000,
      "a successful renewal appends its duration after the current expiry");

    const schoolOrderResponse = await post("/api/billing/orders", {
      buyerType: "school",
      schoolId: Number(school.id),
      studentIds: [studentTwoId, studentThreeId],
    }, schoolBuyerId);
    assert.equal(schoolOrderResponse.status, 201);
    const schoolOrder = (await schoolOrderResponse.json()).order;
    assert.equal(schoolOrder.quantity, 2);
    assert.equal(schoolOrder.amountVnd, 100000);
    const schoolPayment = await sendWebhook({
      id: 900002, gateway: "Vietcombank", accountNumber: env.SEPAY_ACCOUNT_NUMBER,
      transferType: "in", transferAmount: 100000, content: schoolOrder.orderCode,
      referenceCode: "FT-BILLING-SCHOOL",
    });
    assert.equal(schoolPayment.status, 200);
    const recipients = (await fixture.db.query(
      "SELECT user_id,school_plan,school_expires_at FROM users WHERE id=ANY($1::bigint[]) ORDER BY id",
      [[studentTwoId, studentThreeId]],
    )).rows;
    assert.equal(recipients.length, 2);
    assert.ok(recipients.every(row => row.school_plan === "standard" && new Date(row.school_expires_at).getTime() > Date.now()));
    const orderState = (await fixture.db.query("SELECT status FROM billing_orders WHERE id=$1", [schoolOrder.id])).rows[0];
    assert.equal(orderState.status, "paid");
    const duplicateAttempt = await sendWebhook({
      id: 900002, gateway: "Vietcombank", accountNumber: env.SEPAY_ACCOUNT_NUMBER,
      transferType: "in", transferAmount: 100000, content: schoolOrder.orderCode,
      referenceCode: "FT-BILLING-SCHOOL",
    });
    assert.equal(duplicateAttempt.status, 200);
    const schoolSubCount = (await fixture.db.query(
      "SELECT count(*)::int AS n FROM billing_subscriptions WHERE order_id=$1",
      [schoolOrder.id],
    )).rows[0];
    assert.equal(schoolSubCount.n, 2);
    assert.equal(publicUser({ id: studentTwoId, role: "user", school_plan: "standard", school_expires_at: recipients[0].school_expires_at }).schoolPlan, "standard");
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await fixture.close();
  }
});


test("Billing reminder worker queues one email and notification seven days before the active Standard expiry", async () => {
  const fixture = await testDatabase({ memoryOnly: true });
  const emailEnv = {
    PUBLIC_ORIGIN: "https://maihoc.example",
    SMTP_HOST: "smtp.example",
    SMTP_PORT: "587",
    SMTP_USER: "billing-mailer@maihoc.example",
    SMTP_PASS: "test-mail-secret",
    SMTP_FROM: "MAIHOC <billing-mailer@maihoc.example>",
  };
  const sent = [];
  try {
    await ensureAccountUpgrade(fixture.db);
    const user = (await fixture.db.query(
      "INSERT INTO users(name,email,password_hash,role,admin_level,account_type,school_plan) VALUES('Reminder Student','reminder@test.local','test-hash','user',0,'school','standard') RETURNING id",
    )).rows[0];
    const userId = Number(user.id);
    const orderId = crypto.randomUUID(), subscriptionId = crypto.randomUUID();
    const startsAt = new Date(), expiresAt = new Date(Date.now() + 5 * 86400000);
    await fixture.db.query(
      `INSERT INTO billing_orders(id,order_code,buyer_user_id,buyer_type,plan_code,unit_price_vnd,quantity,amount_vnd,duration_days,status,payment_deadline)
       VALUES($1,'MAIHOCREMINDER000001',$2,'student','standard',50000,1,50000,30,'paid',$3)`,
      [orderId,userId,new Date(Date.now()+60000)],
    );
    await fixture.db.query(
      `INSERT INTO billing_subscriptions(id,user_id,order_id,plan_code,starts_at,expires_at,status)
       VALUES($1,$2,$3,'standard',$4,$5,'active')`,
      [subscriptionId,userId,orderId,startsAt,expiresAt],
    );
    await fixture.db.query("UPDATE users SET school_expires_at=$1 WHERE id=$2",[expiresAt,userId]);
    const worker = createBillingReminderWorker(fixture.db,{
      env:emailEnv,
      send:async message=>{sent.push(message);},
    });
    assert.equal(await worker.drain(),1);
    assert.equal(sent.length,1);
    assert.match(sent[0].subject,/hết hạn sau 7 ngày/);
    assert.match(sent[0].text,/thanh toán gia hạn/);
    assert.equal(await worker.drain(),0,"a reminder is sent only once for a subscription");
    const reminder=(await fixture.db.query("SELECT status FROM billing_reminders WHERE subscription_id=$1",[subscriptionId])).rows[0];
    assert.equal(reminder.status,"sent");
    const notice=(await fixture.db.query("SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND type='billing_renewal_reminder'",[userId])).rows[0];
    assert.equal(notice.n,1,"the in-app reminder is created once when the 7-day reminder is queued");
  } finally {
    await fixture.close();
  }
});
