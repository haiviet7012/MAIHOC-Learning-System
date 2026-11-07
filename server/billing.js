import crypto from "node:crypto";
import { deliverMail, mailConfig } from "./mail-delivery.js";
import { publicAppOrigin } from "./school-notifications.js";
import { isSuperAdminUser } from "./auth.js";

const DAY_MS = 86400000;
const enabled = (env = process.env) => ["1", "true", "yes"].includes(String(env.SEPAY_ENABLED || "").trim().toLowerCase());
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(error => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
  if (status >= 500) console.error("[Billing]", error?.message || "Unexpected request failure.");
  return res.status(status).json({ error: status >= 500 ? "Không thể xử lý yêu cầu Billing." : error.message });
});
const positiveInt = value => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const billingConfig = (env = process.env) => ({
  enabled: enabled(env),
  price: positiveInt(env.SCHOOL_STANDARD_PRICE_VND),
  durationDays: positiveInt(env.SCHOOL_STANDARD_DURATION_DAYS),
  accountNumber: String(env.SEPAY_ACCOUNT_NUMBER || "").trim(),
  bankCode: String(env.SEPAY_BANK_CODE || "").trim(),
  webhookSecret: String(env.SEPAY_WEBHOOK_SECRET || "").trim(),
});
const hasPermanentSchool = user => ['legacy', 'premium'].includes(user.schoolPlan ?? user.school_plan) || (user.schoolPlan ?? user.school_plan) === 'standard' && (user.schoolExpiresAt ?? user.school_expires_at) == null;
const money = value => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(value || 0)) + "đ";
const qrUrl = (order, env = process.env) => {
  const config = billingConfig(env);
  if (!config.accountNumber || !config.bankCode) return null;
  const url = new URL("https://vietqr.app/img");
  url.searchParams.set("acc", config.accountNumber);
  url.searchParams.set("bank", config.bankCode);
  url.searchParams.set("amount", String(order.amount_vnd));
  url.searchParams.set("des", `SEVQR ${order.order_code}`);
  url.searchParams.set("template", "compact");
  url.searchParams.set("showinfo", "true");
  return url.toString();
};
const safeEqualHex = (left, right) => {
  if (!/^[a-f0-9]{64}$/i.test(left || "") || !/^[a-f0-9]{64}$/i.test(right || "")) return false;
  const a = Buffer.from(left, "hex"), b = Buffer.from(right, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export function verifySePaySignature({ rawBody, signature, timestamp, secret, now = Date.now(), toleranceSeconds = 300 }) {
  if (!rawBody || !secret || !signature || !timestamp) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || Math.abs(Math.floor(now / 1000) - seconds) > toleranceSeconds) return false;
  const supplied = String(signature).replace(/^sha256=/i, "");
  const expected = crypto.createHmac("sha256", secret).update(String(timestamp) + "." + rawBody).digest("hex");
  return safeEqualHex(supplied, expected);
}

function orderCodeFromContent(value) {
  const match = String(value || "").toUpperCase().match(/MAIHOC[A-F0-9]{14}/);
  return match?.[0] || null;
}

function canBuyForSchool(user, schoolId, db) {
  if (isSuperAdminUser(user)) return Promise.resolve(true);
  return db.query(
    "SELECT 1 FROM school_memberships m JOIN schools s ON s.id=m.school_id WHERE m.school_id=$1 AND m.user_id=$2 AND m.role='school_admin' AND m.status='active' AND s.status='active' LIMIT 1",
    [schoolId, user.id],
  ).then(result => result.rows.length > 0);
}

async function schoolRows(db, user) {
  if (isSuperAdminUser(user)) {
    return (await db.query("SELECT id,name,code FROM schools WHERE status='active' ORDER BY name")).rows;
  }
  return (await db.query(
    "SELECT s.id,s.name,s.code FROM schools s JOIN school_memberships m ON m.school_id=s.id WHERE m.user_id=$1 AND m.role='school_admin' AND m.status='active' AND s.status='active' ORDER BY s.name",
    [user.id],
  )).rows;
}

export function installBillingRoutes(app, { db, requireAuth, requireSameOrigin, env = process.env, now = () => Date.now() }) {
  app.get("/api/billing/plans", requireAuth, wrap(async (_req, res) => {
    const config = billingConfig(env);
    res.json({
      plans: config.price && config.durationDays ? [{
        code: "standard",
        name: "School Standard",
        priceVnd: config.price,
        durationDays: config.durationDays,
        features: ["Gia sư AI và Cố vấn học tập", "Số hóa đề, Vở học AI và học liệu School", "Phòng học trực tuyến và thí nghiệm mô phỏng", "Bài tập, kiểm tra và theo dõi kết quả"],
      }] : [],
      enabled: config.enabled && Boolean(config.price && config.durationDays && config.accountNumber && config.bankCode && config.webhookSecret),
      paymentConfigured: Boolean(config.accountNumber && config.bankCode && config.webhookSecret),
    });
  }));

  app.get("/api/billing/options", requireAuth, wrap(async (req, res) => {
    const schools = await schoolRows(db, req.user);
    res.json({
      canBuyForSchool: schools.length > 0,
      schools,
      canBuyForSelf: req.user.role === "user" && !req.user.isTeacher && !req.user.isSuperAdmin && !hasPermanentSchool(req.user),
    });
  }));

  app.get("/api/billing/schools/:schoolId/students", requireAuth, wrap(async (req, res) => {
    const schoolId = positiveInt(req.params.schoolId);
    if (!schoolId || !(await canBuyForSchool(req.user, schoolId, db))) fail("Bạn không có quyền mua gói cho trường này.", 403);
    const result = await db.query(
      `SELECT u.id,u.name,u.email,c.class_code AS "classCode"
       FROM school_memberships m JOIN users u ON u.id=m.user_id
       LEFT JOIN student_enrollments e ON e.school_id=m.school_id AND e.student_id=u.id AND e.status='active'
       LEFT JOIN classes c ON c.school_id=e.school_id AND c.id=e.class_id
       WHERE m.school_id=$1 AND m.role='student' AND m.status='active' AND u.role='user'
         AND COALESCE(u.school_plan,'none') NOT IN ('legacy','premium')
         AND NOT (u.school_plan='standard' AND u.school_expires_at IS NULL)
       ORDER BY c.class_code NULLS LAST,u.name LIMIT 500`,
      [schoolId],
    );
    res.json({ students: result.rows });
  }));

  app.post("/api/billing/orders", requireSameOrigin, requireAuth, wrap(async (req, res) => {
    const config = billingConfig(env);
    if (!config.enabled) fail("Thanh toán School Standard hiện chưa được bật.", 503);
    if (!config.price || !config.durationDays || !config.accountNumber || !config.bankCode || !config.webhookSecret) fail("Cấu hình SePay hoặc giá School Standard chưa đầy đủ.", 503);
    const buyerType = req.body?.buyerType === "school" ? "school" : "student";
    let schoolId = null, recipientIds = [];
    if (buyerType === "student") {
      if (req.user.role !== "user" || req.user.isTeacher || req.user.isSuperAdmin) fail("Chỉ tài khoản học sinh mới được tự mua School Standard.", 403);
      if (hasPermanentSchool(req.user)) fail("Tài khoản đã có School không thời hạn; không cần mua gói này.", 409);
      recipientIds = [Number(req.user.id)];
    } else {
      schoolId = positiveInt(req.body.schoolId);
      if (!schoolId || !(await canBuyForSchool(req.user, schoolId, db))) fail("Bạn không có quyền mua gói cho trường này.", 403);
      const ids = Array.isArray(req.body.studentIds) ? [...new Set(req.body.studentIds.map(Number))] : [];
      if (!ids.length || ids.length > 200 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) fail("Hãy chọn từ 1 đến 200 học sinh hợp lệ.");
      const members = await db.query(
        `SELECT u.id,u.school_plan,u.school_expires_at FROM school_memberships m JOIN users u ON u.id=m.user_id
         WHERE m.school_id=$1 AND m.status='active' AND m.role='student' AND u.role='user' AND u.id=ANY($2::bigint[])`,
        [schoolId, ids],
      );
      if (members.rows.length !== ids.length) fail("Một hoặc nhiều học sinh không còn thuộc trường này. Hãy tải lại danh sách.");
      if (members.rows.some(hasPermanentSchool)) fail("Danh sách có học sinh đã có School không thời hạn. Hãy bỏ các em này khỏi đơn.");
      recipientIds = members.rows.map(row => Number(row.id));
    }
    const quantity = recipientIds.length;
    const amount = config.price * quantity;
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000000) fail("Tổng tiền đơn hàng vượt giới hạn hợp lệ.");
    const id = crypto.randomUUID();
    const orderCode = "MAIHOC" + crypto.randomBytes(7).toString("hex").toUpperCase();
    const createdAt = new Date(now());
    const requestedExpiry = Number(env.BILLING_ORDER_EXPIRE_MINUTES || 20);
    const expiryMinutes = Number.isFinite(requestedExpiry) ? Math.max(5, Math.min(60, requestedExpiry)) : 20;
    const deadline = new Date(now() + expiryMinutes * 60000);
    const order = await db.transaction(async () => {
      const inserted = await db.query(
        `INSERT INTO billing_orders(id,order_code,buyer_user_id,buyer_type,school_id,plan_code,unit_price_vnd,quantity,amount_vnd,duration_days,status,payment_deadline,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,'standard',$6,$7,$8,$9,'pending',$10,$11,$11) RETURNING *`,
        [id, orderCode, req.user.id, buyerType, schoolId, config.price, quantity, amount, config.durationDays, deadline, createdAt],
      );
      for (const studentId of recipientIds) {
        await db.query("INSERT INTO billing_order_recipients(order_id,user_id) VALUES($1,$2)", [id, studentId]);
      }
      return inserted.rows[0];
    })();
    res.status(201).json({
      order: {
        id: order.id, orderCode: order.order_code, buyerType: order.buyer_type,
        amountVnd: Number(order.amount_vnd), unitPriceVnd: Number(order.unit_price_vnd),
        quantity: Number(order.quantity), durationDays: Number(order.duration_days),
        status: order.status, paymentDeadline: order.payment_deadline,
        transferContent: `SEVQR ${order.order_code}`, qrImageUrl: qrUrl(order, env),
        accountNumber: config.accountNumber, bankCode: config.bankCode,
      },
    });
  }));

  app.get("/api/billing/orders/:orderCode", requireAuth, wrap(async (req, res) => {
    const orderCode = String(req.params.orderCode || "").toUpperCase();
    await db.query("UPDATE billing_orders SET status='expired',updated_at=now() WHERE order_code=$1 AND status='pending' AND payment_deadline<=now()", [orderCode]);
    const result = await db.query(
      `SELECT o.*,s.name AS school_name,(SELECT count(*) FROM billing_order_recipients r WHERE r.order_id=o.id)::int AS recipient_count
       FROM billing_orders o LEFT JOIN schools s ON s.id=o.school_id
       WHERE o.order_code=$1 AND (o.buyer_user_id=$2 OR EXISTS(SELECT 1 FROM billing_order_recipients r WHERE r.order_id=o.id AND r.user_id=$2))`,
      [orderCode, req.user.id],
    );
    const order = result.rows[0];
    if (!order) fail("Không tìm thấy đơn hàng hoặc bạn không có quyền xem.", 404);
    res.json({ order: {
      id: order.id, orderCode: order.order_code, buyerType: order.buyer_type,
      schoolName: order.school_name, amountVnd: Number(order.amount_vnd),
      unitPriceVnd: Number(order.unit_price_vnd), quantity: Number(order.quantity),
      durationDays: Number(order.duration_days), status: order.status,
      paymentDeadline: order.payment_deadline, paidAt: order.paid_at,
      transferContent: `SEVQR ${order.order_code}`, qrImageUrl: qrUrl(order, env),
      accountNumber: billingConfig(env).accountNumber, bankCode: billingConfig(env).bankCode,
      recipientCount: Number(order.recipient_count),
    }});
  }));

  app.get("/api/billing/history", requireAuth, wrap(async (req, res) => {
    const result = await db.query(
      `SELECT o.id,o.order_code AS "orderCode",o.buyer_type AS "buyerType",o.plan_code AS "planCode",
       o.amount_vnd AS "amountVnd",o.quantity,o.duration_days AS "durationDays",o.status,
       o.created_at AS "createdAt",o.paid_at AS "paidAt",s.name AS "schoolName"
       FROM billing_orders o LEFT JOIN schools s ON s.id=o.school_id
       WHERE o.buyer_user_id=$1 OR EXISTS(SELECT 1 FROM billing_order_recipients r WHERE r.order_id=o.id AND r.user_id=$1)
       ORDER BY o.created_at DESC LIMIT 50`,
      [req.user.id],
    );
    res.json({ orders: result.rows });
  }));

  app.get("/api/billing/subscription", requireAuth, wrap(async (req, res) => {
    const result = await db.query(
      `SELECT id,plan_code AS "planCode",starts_at AS "startsAt",expires_at AS "expiresAt",status,created_at AS "createdAt"
       FROM billing_subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [req.user.id],
    );
    res.json({ subscriptions: result.rows, schoolPlan: req.user.schoolPlan || "none", schoolExpiresAt: req.user.schoolExpiresAt || null });
  }));

  app.post("/api/billing/sepay/webhook", wrap(async (req, res) => {
    const config = billingConfig(env);
    if (!config.enabled || !config.webhookSecret) return res.status(503).json({ success: false, message: "Billing webhook is disabled." });
    const rawBody = req.rawBody;
    const signature = req.get("x-sepay-signature") || "";
    const timestamp = req.get("x-sepay-timestamp") || "";
    if (!verifySePaySignature({ rawBody, signature, timestamp, secret: config.webhookSecret, now: now() })) {
      return res.status(401).json({ success: false, message: "Invalid webhook signature." });
    }
    const payload = req.body;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return res.status(400).json({ success: false, message: "Invalid payload." });
    const gatewayId = String(payload.id ?? "").trim();
    if (!gatewayId) return res.status(400).json({ success: false, message: "Missing transaction id." });
    if (String(payload.transferType || "").toLowerCase() !== "in") return res.status(200).json({ success: true });
    const accountNumber = String(payload.accountNumber || "").trim();
    if (config.accountNumber && accountNumber !== config.accountNumber) {
      return res.status(403).json({ success: false, message: "Unexpected bank account." });
    }
    const transferAmount = positiveInt(payload.transferAmount);
    if (!transferAmount) return res.status(200).json({ success: true });
    const content = String(payload.content || "");
    const orderCode = orderCodeFromContent(payload.code) || orderCodeFromContent(content);
    await db.transaction(async () => {
      const inserted = await db.query(
        `INSERT INTO billing_transactions(gateway_transaction_id,gateway,account_number,transfer_type,transfer_amount,transfer_content,reference_code,transaction_date,status,payload)
         VALUES($1,$2,$3,'in',$4,$5,$6,$7,'unmatched',$8::jsonb)
         ON CONFLICT(gateway_transaction_id) DO NOTHING RETURNING id`,
        [gatewayId, String(payload.gateway || ""), accountNumber, transferAmount, content, String(payload.referenceCode || ""), String(payload.transactionDate || ""), JSON.stringify(payload)],
      );
      if (!inserted.rows.length) return;
      if (!orderCode) return;
      const order = (await db.query("SELECT * FROM billing_orders WHERE order_code=$1 FOR UPDATE", [orderCode])).rows[0];
      if (!order) return;
      if (order.status !== "pending") {
        await db.query("UPDATE billing_transactions SET order_id=$1,status='order_not_pending' WHERE gateway_transaction_id=$2", [order.id, gatewayId]);
        return;
      }
      if (new Date(order.payment_deadline).getTime() < now()) {
        await db.query("UPDATE billing_orders SET status='expired',updated_at=now() WHERE id=$1 AND status='pending'", [order.id]);
        await db.query("UPDATE billing_transactions SET order_id=$1,status='late_payment' WHERE gateway_transaction_id=$2", [order.id, gatewayId]);
        return;
      }
      if (Number(order.amount_vnd) !== transferAmount) {
        await db.query("UPDATE billing_transactions SET order_id=$1,status='amount_mismatch' WHERE gateway_transaction_id=$2", [order.id, gatewayId]);
        return;
      }
      const recipients = (await db.query("SELECT user_id FROM billing_order_recipients WHERE order_id=$1 ORDER BY user_id", [order.id])).rows;
      if (!recipients.length) {
        await db.query("UPDATE billing_transactions SET order_id=$1,status='unmatched' WHERE gateway_transaction_id=$2", [order.id, gatewayId]);
        return;
      }
      for (const recipient of recipients) {
        const studentId = Number(recipient.user_id);
        const lockedUser = await db.query("SELECT id,school_plan,school_expires_at FROM users WHERE id=$1 AND role='user' FOR UPDATE", [studentId]);
        if (!lockedUser.rows.length) continue;
        const timing = (await db.query(
          "SELECT GREATEST(now(),COALESCE(max(expires_at),now())) AS starts_at FROM billing_subscriptions WHERE user_id=$1 AND status='active' AND expires_at>now()",
          [studentId],
        )).rows[0];
        const startsAt = new Date(timing.starts_at);
        const expiresAt = new Date(startsAt.getTime() + Number(order.duration_days) * DAY_MS);
        const subscriptionId = crypto.randomUUID();
        await db.query(
          `INSERT INTO billing_subscriptions(id,user_id,order_id,school_id,plan_code,starts_at,expires_at,status)
           VALUES($1,$2,$3,$4,'standard',$5,$6,'active')`,
          [subscriptionId, studentId, order.id, order.school_id, startsAt, expiresAt],
        );
        await db.query("UPDATE billing_order_recipients SET subscription_id=$1 WHERE order_id=$2 AND user_id=$3", [subscriptionId, order.id, studentId]);
        if (!hasPermanentSchool(lockedUser.rows[0])) await db.query("UPDATE users SET school_plan='standard',school_expires_at=$1,account_type='school' WHERE id=$2 AND role='user'", [expiresAt, studentId]);
        await db.prepare("INSERT INTO notifications(user_id,type,title,message,link) VALUES(?,?,?,?,?)")
          .run(studentId, "billing_activated", "MAIHOC School Standard đã được kích hoạt", "Gói School Standard đã được kích hoạt hoặc gia hạn thành công.", "/school/plans");
      }
      await db.query("UPDATE billing_orders SET status='paid',paid_at=now(),updated_at=now() WHERE id=$1 AND status='pending'", [order.id]);
      await db.query("UPDATE billing_transactions SET order_id=$1,status='matched' WHERE gateway_transaction_id=$2", [order.id, gatewayId]);
    })();
    res.status(200).json({ success: true });
  }));

  app.get("/api/admin/billing/overview", requireAuth, wrap(async (req, res) => {
    if (!isSuperAdminUser(req.user)) fail("Chỉ quản trị viên cao nhất được xem Billing.", 403);
    const summary = (await db.query(
      `SELECT count(*) FILTER (WHERE status='paid')::int AS paid_orders,
       count(*) FILTER (WHERE status='pending')::int AS pending_orders,
       COALESCE(sum(amount_vnd) FILTER (WHERE status='paid'),0)::bigint AS revenue_vnd
       FROM billing_orders`,
    )).rows[0];
    const recent = (await db.query(
      `SELECT id,order_code AS "orderCode",buyer_type AS "buyerType",quantity,amount_vnd AS "amountVnd",status,created_at AS "createdAt",paid_at AS "paidAt"
       FROM billing_orders ORDER BY created_at DESC LIMIT 100`,
    )).rows;
    const mismatches = (await db.query(
      `SELECT id,gateway_transaction_id AS "transactionId",transfer_amount AS "transferAmount",transfer_content AS "transferContent",status,created_at AS "createdAt"
       FROM billing_transactions WHERE status<>'matched' ORDER BY created_at DESC LIMIT 100`,
    )).rows;
    res.json({ summary, orders: recent, exceptions: mismatches });
  }));
}

export function createBillingReminderWorker(db, { env = process.env, send = deliverMail, now = Date.now, intervalMs = 6 * 60 * 60 * 1000 } = {}) {
  let timer = null, busy = false;
  async function drain({ limit = 25 } = {}) {
    if (busy) return 0;
    busy = true;
    let sent = 0;
    try {
      await db.query("UPDATE billing_subscriptions SET status='expired',updated_at=now() WHERE status='active' AND expires_at<=now()");
      await db.query("UPDATE billing_orders SET status='expired',updated_at=now() WHERE status='pending' AND payment_deadline<=now()");
      await db.query("UPDATE users SET school_plan='none',school_expires_at=NULL WHERE school_plan='standard' AND school_expires_at IS NOT NULL AND school_expires_at<=now()");
      await db.query(
        `WITH queued AS (
           INSERT INTO billing_reminders(subscription_id,user_id,next_at)
           SELECT s.id,s.user_id,s.expires_at-interval '7 days'
           FROM billing_subscriptions s JOIN users u ON u.id=s.user_id
           WHERE u.school_plan='standard' AND u.school_expires_at IS NOT NULL AND s.status='active' AND s.expires_at>now() AND s.expires_at<=now()+interval '7 days'
             AND s.expires_at=(SELECT max(s2.expires_at) FROM billing_subscriptions s2 WHERE s2.user_id=s.user_id AND s2.status='active')
           ON CONFLICT(subscription_id) DO NOTHING
           RETURNING user_id
         )
         INSERT INTO notifications(user_id,type,title,message,link)
         SELECT user_id,'billing_renewal_reminder','School Standard sắp hết hạn',
           'Gói School Standard của bạn sẽ hết hạn sau 7 ngày. Hãy gia hạn để tiếp tục sử dụng.','/school/plans'
         FROM queued`,
      );
      if (!mailConfig(env).configured || !publicAppOrigin(env)) return 0;
      for (let i = 0; i < limit; i++) {
        const token = crypto.randomUUID(), timestamp = new Date(now());
        const job = await db.transaction(async () => {
          const row = (await db.query(
            `SELECT r.id,r.subscription_id,r.user_id,r.attempts,u.email,u.name,s.expires_at
             FROM billing_reminders r JOIN users u ON u.id=r.user_id JOIN billing_subscriptions s ON s.id=r.subscription_id
             WHERE r.status IN ('queued','sending') AND r.next_at<=$1 AND s.status='active' AND s.expires_at>=$1
             ORDER BY r.next_at,r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED`,
            [timestamp],
          )).rows[0];
          if (!row) return null;
          await db.query("UPDATE billing_reminders SET status='sending',attempts=attempts+1,claim_token=$1,next_at=$2 WHERE id=$3", [token, new Date(now() + 120000), row.id]);
          return row;
        })();
        if (!job) break;
        try {
          const current = (await db.query("SELECT school_expires_at,email FROM users WHERE id=$1", [job.user_id])).rows[0];
          if (!current?.email || !current.school_expires_at || new Date(current.school_expires_at).getTime() !== new Date(job.expires_at).getTime()) {
            await db.query("UPDATE billing_reminders SET status='cancelled',claim_token=NULL WHERE id=$1 AND claim_token=$2", [job.id, token]);
            continue;
          }
          const expiry = new Date(job.expires_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "long", timeStyle: "short" });
          const link = publicAppOrigin(env) + "/school/plans";
          await send({
            to: current.email,
            subject: "[MAIHOC] Gói School Standard sẽ hết hạn sau 7 ngày",
            text: `Chào ${job.name || "bạn"},\n\nGói MAIHOC School Standard của bạn dự kiến hết hạn vào ${expiry} (giờ Việt Nam). Hãy thanh toán gia hạn tại ${link}. Khi nhận được khoản thanh toán hợp lệ, hệ thống sẽ tự động nối tiếp thời hạn sử dụng.\n\nMAIHOC`,
            html: `<p>Chào ${String(job.name || "bạn").replace(/[&<>"]/g, "")},</p><p>Gói MAIHOC School Standard của bạn dự kiến hết hạn vào <strong>${expiry} (giờ Việt Nam)</strong>.</p><p><a href="${link}">Thanh toán gia hạn</a>. Khi nhận được khoản thanh toán hợp lệ, hệ thống sẽ tự động nối tiếp thời hạn sử dụng.</p><p>MAIHOC</p>`,
          }, { env });
          await db.query("UPDATE billing_reminders SET status='sent',sent_at=now(),claim_token=NULL WHERE id=$1 AND claim_token=$2", [job.id, token]);
          sent++;
        } catch (error) {
          const category = /^[A-Z0-9_]{1,50}$/.test(error?.code || "") ? error.code : "MAIL_DELIVERY_FAILED";
          const attempts = Number(job.attempts) + 1;
          await db.query(
            "UPDATE billing_reminders SET status=$1,next_at=$2,claim_token=NULL WHERE id=$3 AND claim_token=$4",
            [attempts >= 8 ? "failed" : "queued", new Date(now() + Math.min(86400000, 60000 * 2 ** Math.max(0, attempts - 1))), job.id, token],
          );
          console.warn("[Billing reminder]", { id: job.id, category });
        }
      }
    } finally {
      busy = false;
    }
    return sent;
  }
  return {
    drain,
    start() {
      if (!timer) {
        void drain().catch(() => console.warn("[Billing reminder] Initial scan failed."));
        timer = setInterval(() => { void drain().catch(() => console.warn("[Billing reminder] Queue scan failed.")); }, intervalMs);
        timer.unref?.();
      }
    },
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
}
