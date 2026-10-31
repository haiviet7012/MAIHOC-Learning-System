import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const serverSource = fs.readFileSync(path.join(serverDir, "../server.js"), "utf8");

function extractBetween(source, start, end) {
  const startAt = source.indexOf(start);
  assert.notEqual(startAt, -1, `Missing source marker: ${start}`);
  const endAt = source.indexOf(end, startAt);
  assert.notEqual(endAt, -1, `Missing end marker: ${end}`);
  return source.slice(startAt, endAt);
}

test("password recovery OTP is not logged or delivered in-app", () => {
  const helper = extractBetween(
    serverSource,
    "async function sendVerificationCodeEmail",
    "async function issueVerificationCode"
  );
  assert.match(helper, /purpose === "forgot_password"/);
  assert.match(helper, /if \(!isRecoveryFlow && process\.env\.NODE_ENV !== "production"\)/);
  assert.match(helper, /if \(userId && !isRecoveryFlow\)/);
  assert.doesNotMatch(helper, /console\.log\([^\n]*\bcode\b/);
  assert.match(helper, /isRecoveryFlow \|\| process\.env\.NODE_ENV === "production" \? \{\} : \{ devCode: code \}/);
});

test("forgot-password response never serializes the development OTP", () => {
  const route = extractBetween(
    serverSource,
    'app.post("/api/auth/forgot-password"',
    'app.post("/api/auth/reset-password"'
  );
  assert.doesNotMatch(route, /devCode/);
  assert.match(route, /purpose: "forgot_password"/);
});

test("presence cleanup is scheduled and absent from hot online endpoints", () => {
  const ping = extractBetween(
    serverSource,
    'app.post("/api/presence/ping"',
    'app.get("/api/presence/online"'
  );
  const online = extractBetween(
    serverSource,
    'app.get("/api/presence/online"',
    "// Admin information"
  );
  assert.doesNotMatch(ping, /cleanExpiredPresence|DELETE FROM sessions|DELETE FROM user_presence/);
  assert.doesNotMatch(online, /cleanExpiredPresence|DELETE FROM sessions|DELETE FROM user_presence/);
  assert.match(serverSource, /intervalMs = 5 \* 60 \* 1000/);
  assert.match(serverSource, /startPresenceCleanup\(\)/);
});
