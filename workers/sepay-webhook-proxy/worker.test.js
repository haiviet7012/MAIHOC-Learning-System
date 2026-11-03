import assert from "node:assert/strict";
import test from "node:test";
import { createWorker } from "./worker.js";

const BACKEND_ORIGIN = "https://maihoc-learning-system.onrender.com";
const env = { BACKEND_ORIGIN };
const WEBHOOK_PATH = "/api/billing/sepay/webhook";

test("health endpoint responds without contacting the backend", async () => {
  let called = false;
  const worker = createWorker(async () => {
    called = true;
    throw new Error("backend should not be called");
  });
  const response = await worker.fetch(new Request("https://proxy.example/health"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    service: "maihoc-sepay-webhook-proxy",
  });
  assert.equal(called, false);
});

test("only the exact SePay webhook path is exposed", async () => {
  let called = false;
  const worker = createWorker(async () => {
    called = true;
    throw new Error("backend should not be called");
  });
  const response = await worker.fetch(
    new Request("https://proxy.example/api/billing/sepay/webhook/extra", { method: "POST" }),
    env,
  );
  assert.equal(response.status, 404);
  assert.equal(called, false);
});

test("webhook path accepts POST only", async () => {
  const worker = createWorker(async () => {
    throw new Error("backend should not be called");
  });
  const response = await worker.fetch(
    new Request("https://proxy.example" + WEBHOOK_PATH),
    env,
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});

test("forwards original body bytes and HMAC headers to the fixed backend", async () => {
  const originalBody = new TextEncoder().encode(
    '{ "id": 123, "content": "MAIHOC abc", "unicode": "học phí" }\n',
  );
  let captured;
  const worker = createWorker(async (url, init) => {
    captured = { url: String(url), init };
    return new Response('{"success":true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  const request = new Request("https://attacker.example" + WEBHOOK_PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-sepay-signature": "sha256=abc123",
      "x-sepay-timestamp": "1793750400",
      authorization: "Bearer must-not-forward",
      cookie: "session=must-not-forward",
      "x-forwarded-for": "203.0.113.10",
      "cf-connecting-ip": "203.0.113.10",
    },
    body: originalBody,
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(captured.url, BACKEND_ORIGIN + WEBHOOK_PATH);
  assert.equal(captured.init.method, "POST");
  assert.deepEqual(
    new Uint8Array(captured.init.body),
    originalBody,
    "the proxy must not parse, normalize, or re-serialize the signed body",
  );
  const headers = new Headers(captured.init.headers);
  assert.equal(headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(headers.get("x-sepay-signature"), "sha256=abc123");
  assert.equal(headers.get("x-sepay-timestamp"), "1793750400");
  assert.equal(headers.get("authorization"), null);
  assert.equal(headers.get("cookie"), null);
  assert.equal(headers.get("x-forwarded-for"), null);
  assert.equal(headers.get("cf-connecting-ip"), null);
});

test("passes backend status and response body through unchanged", async () => {
  const worker = createWorker(async () => new Response(
    "forbidden",
    { status: 403, headers: { "content-type": "text/plain" } },
  ));
  const response = await worker.fetch(
    new Request("https://proxy.example" + WEBHOOK_PATH, { method: "POST", body: "{}" }),
    env,
  );
  assert.equal(response.status, 403);
  assert.equal(await response.text(), "forbidden");
});

test("passes backend HMAC validation errors through unchanged", async () => {
  const worker = createWorker(async () => new Response(
    '{"success":false,"message":"Invalid webhook signature."}',
    { status: 401, headers: { "content-type": "application/json" } },
  ));
  const response = await worker.fetch(
    new Request("https://proxy.example" + WEBHOOK_PATH, { method: "POST", body: "{}" }),
    env,
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    message: "Invalid webhook signature.",
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("rejects missing or unsafe backend configuration without forwarding", async () => {
  let calls = 0;
  const worker = createWorker(async () => {
    calls += 1;
    throw new Error("backend should not be called");
  });
  const request = new Request("https://proxy.example" + WEBHOOK_PATH, {
    method: "POST",
    body: "{}",
  });
  for (const invalidEnv of [
    {},
    { BACKEND_ORIGIN: "http://maihoc-learning-system.onrender.com" },
    { BACKEND_ORIGIN: "https://example.com/path" },
    { BACKEND_ORIGIN: "https://user:pass@example.com" },
  ]) {
    const response = await worker.fetch(request.clone(), invalidEnv);
    assert.equal(response.status, 503);
  }
  assert.equal(calls, 0);
});

test("rejects oversized request bodies", async () => {
  let calls = 0;
  const worker = createWorker(async () => {
    calls += 1;
    throw new Error("backend should not be called");
  });
  const response = await worker.fetch(
    new Request("https://proxy.example" + WEBHOOK_PATH, {
      method: "POST",
      body: new Uint8Array(1024 * 1024 + 1),
    }),
    env,
  );
  assert.equal(response.status, 413);
  assert.equal(calls, 0);
});

test("returns 502 when the backend cannot be reached", async () => {
  const worker = createWorker(async () => {
    throw new Error("simulated network failure");
  });
  const response = await worker.fetch(
    new Request("https://proxy.example" + WEBHOOK_PATH, {
      method: "POST",
      body: "{}",
    }),
    env,
  );
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    success: false,
    message: "MAIHOC backend is temporarily unavailable.",
  });
});
