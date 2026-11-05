import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { installLiteratureRoutes } from "../server/grading/literature-routes.js";
import { literatureTargets } from "../server/grading/literature-engine.js";
import { createLiteratureGenerator } from "../server/grading/literature-ai.js";
import { geminiConfig } from "../server/ai-provider.js";
import { checkAi } from "../server/check-ai.js";

const require = createRequire(new URL("../server/package.json", import.meta.url));
const express = require("express");
const env = {
  LITERATURE_AI_API_KEY: "literature-fixture-key", LITERATURE_AI_MODEL: "gemini-literature-fixture",
  GEMINI_API_KEY: "shared-fixture-key", GEMINI_MODEL: "gemini-shared-fixture",
  GEMINI_SOLUTION_API_KEY: "exam-fixture-key", GEMINI_SOLUTION_MODEL: "gemini-exam-fixture"
};
const exam = () => ({
  schemaVersion: 1, reviewStatus: "approved", passage: "Ngữ liệu\ngiữ nguyên xuống dòng.", source: "Đề do giáo viên cung cấp",
  questions: literatureTargets().map(q => ({ targetId: q.targetId, questionText: "Câu " + q.targetId,
    guidance: "Chấp nhận lập luận có căn cứ và diễn đạt tương đương.", context: "" }))
});
const payload = () => ({ exam: exam(), answers: { "II-1": "Lập luận có căn cứ." } });
const generate = async ({ data }) => ({ questions: data.questions.map(q => ({
  targetId: q.targetId, confidence: 0.95,
  criteria: q.criteria.map(c => ({ id: c.id, points: c.maxPoints,
    feedback: "Có lập luận.", evidence: [q.studentAnswer] }))
})) });

async function start(t, options = {}) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    const role = req.get("x-fixture-role");
    if (role) req.user = { id: req.get("x-fixture-user") || "42", role };
    next();
  });
  installLiteratureRoutes(app, {
    requireSameOrigin(req, res, next) {
      if (req.get("origin") !== "https://maihoc.test") return res.status(403).json({ error: "Origin" });
      next();
    },
    requireAdmin(req, res, next) {
      if (!req.user) return res.sendStatus(401);
      if (!["teacher", "admin"].includes(req.user.role)) return res.sendStatus(403);
      next();
    },
    env, generatorFactory: () => generate, ...options
  });
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: "Invalid request" }));
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return (body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/admin/literature/grade`, {
    method: "POST", headers: { "Content-Type": "application/json", "Origin": "https://maihoc.test",
      "x-fixture-role": "teacher", ...headers }, body: JSON.stringify(body)
  });
}

test("Literature config is dedicated, normalized and never falls back to shared/exam credentials", () => {
  const config = geminiConfig("literature", { ...env, LITERATURE_AI_API_KEY: ' "literature-fixture-key" ',
    LITERATURE_AI_MODEL: " models/gemini-literature-fixture " });
  assert.equal(config.apiKey, env.LITERATURE_AI_API_KEY);
  assert.equal(config.model, env.LITERATURE_AI_MODEL);
  assert.equal(config.keySource, "LITERATURE_AI_API_KEY");
  for (const override of [
    { LITERATURE_AI_API_KEY: "" }, { LITERATURE_AI_MODEL: "" },
    { LITERATURE_AI_API_KEY: "bad\nkey" }, { LITERATURE_AI_MODEL: "https://invalid" }
  ]) assert.throws(() => geminiConfig("literature", { ...env, ...override }));
  assert.equal(geminiConfig("shared", env).apiKey, env.GEMINI_API_KEY);
  assert.equal(geminiConfig("exam", env).apiKey, env.GEMINI_SOLUTION_API_KEY);
});

test("AI diagnostic includes Literature only when its dedicated configuration is requested", async () => {
  const result = await checkAi({ env });
  const literature = result.find(row => row.scope === "literature");
  assert.equal(literature.status, "CONFIGURED_NOT_VERIFIED");
  assert.equal(literature.keySource, "LITERATURE_AI_API_KEY");
  assert.equal(literature.model, env.LITERATURE_AI_MODEL);
  assert.ok(!JSON.stringify(result).includes(env.LITERATURE_AI_API_KEY));
  const missing = await checkAi({ env: { ...env, LITERATURE_AI_API_KEY: "" } });
  assert.equal(missing.find(row => row.scope === "literature").status, "AI_KEY_MISSING");
});

test("Grading API enforces author/reviewer auth and origin before invoking AI", async t => {
  let calls = 0;
  const post = await start(t, { generatorFactory: () => { calls++; return generate; } });
  assert.equal((await post(payload(), { "x-fixture-role": "" })).status, 401);
  assert.equal((await post(payload(), { "x-fixture-role": "student" })).status, 403);
  assert.equal((await post(payload(), { Origin: "https://evil.test" })).status, 403);
  assert.equal(calls, 0);
});

test("Grading API uses Literature credentials and returns only a proposal", async t => {
  let config;
  const post = await start(t, { generatorFactory: options => { config = options; return generate; } });
  const response = await post(payload());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const result = await response.json();
  assert.equal(result.proposedScore, 2);
  assert.equal(result.score, null);
  assert.equal(result.graded, false);
  assert.equal(result.gradingStatus, "provisional");
  assert.deepEqual(config, { apiKey: env.LITERATURE_AI_API_KEY, modelName: env.LITERATURE_AI_MODEL, provider: "gemini" });
  assert.ok(!JSON.stringify(result).includes(env.LITERATURE_AI_API_KEY));
});

test("Missing Literature env produces 503 and never calls the shared provider", async t => {
  let calls = 0;
  const post = await start(t, { env: { ...env, LITERATURE_AI_API_KEY: "" },
    generatorFactory: () => { calls++; return generate; } });
  const response = await post(payload());
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, "LITERATURE_AI_NOT_CONFIGURED");
  assert.ok(!JSON.stringify(body).includes(env.GEMINI_API_KEY));
  assert.equal(calls, 0);
  const blank = await post({ exam: exam(), answers: {} });
  assert.equal(blank.status, 200);
  assert.equal((await blank.json()).proposedScore, 0);
});

test("Reject malformed, unreviewed or oversized inputs before an AI call", async t => {
  let calls = 0;
  const post = await start(t, { generatorFactory: () => { calls++; return generate; } });
  for (const invalid of [null, [], {}, { ...payload(), apiKey: "browser-key" },
    { ...payload(), exam: { ...exam(), reviewStatus: "draft" } },
    { ...payload(), answers: [] }, { ...payload(), answers: { "II-1": 123 } },
    { ...payload(), answers: { "III-1": "Câu lạ" } },
    { ...payload(), answers: { "II-1": "x".repeat(30001) } }]) {
    assert.equal((await post(invalid)).status, 400);
  }
  const large = Object.fromEntries(literatureTargets().map(q => [q.targetId, "ữ".repeat(30000)]));
  assert.equal((await post({ exam: exam(), answers: large })).status, 413);
  assert.equal(calls, 0);
});

test("Provider errors produce pending 202 without leaking secrets", async t => {
  const post = await start(t, { generatorFactory: () => async () => { throw new Error(env.LITERATURE_AI_API_KEY); } });
  const response = await post(payload());
  assert.equal(response.status, 202);
  const result = await response.json();
  assert.equal(result.gradingStatus, "pending_review");
  assert.equal(result.score, null);
  assert.ok(!JSON.stringify(result).includes(env.LITERATURE_AI_API_KEY));
});

test("Per-user rate limit is bounded and resets after its window", async t => {
  let time = 1000;
  const post = await start(t, { now: () => time });
  const blank = { exam: exam(), answers: {} };
  for (let i = 0; i < 12; i++) assert.equal((await post(blank)).status, 200);
  const response = await post(blank);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal((await post(blank, { "x-fixture-user": "43" })).status, 200);
  time += 60000;
  assert.equal((await post(blank)).status, 200);
});

test("Default Literature adapter sends dedicated env key/model through backend SDK", async t => {
  const oldFetch = globalThis.fetch;
  const oldEnv = { ...process.env };
  t.after(() => { globalThis.fetch = oldFetch; process.env = oldEnv; });
  Object.assign(process.env, env);
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.ok(String(url).includes(env.LITERATURE_AI_MODEL));
    assert.ok(!String(url).includes(env.LITERATURE_AI_API_KEY));
    assert.equal(new Headers(options.headers).get("x-goog-api-key"), env.LITERATURE_AI_API_KEY);
    return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: {
      role: "model", parts: [{ text: '{"questions":[]}' }]
    } }] }), { headers: { "Content-Type": "application/json" } });
  };
  assert.deepEqual(await createLiteratureGenerator()({ instruction: "Rubric", data: {} }), { questions: [] });
  assert.equal(calls, 1);
  await assert.rejects(() => createLiteratureGenerator({ apiKey: "partial" })({ instruction: "Rubric", data: {} }),
    error => error.code === "AI_CONFIG_INCOMPLETE");
  assert.equal(calls, 1);
});
