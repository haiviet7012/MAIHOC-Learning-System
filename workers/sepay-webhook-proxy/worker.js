const WEBHOOK_PATH = "/api/billing/sepay/webhook";
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_DIAGNOSTIC_RESPONSE_BYTES = 4096;
const SAFE_UPSTREAM_MESSAGES = new Set([
  "Billing webhook is disabled.",
  "Invalid webhook signature.",
  "Invalid payload.",
  "Missing transaction id.",
  "Unexpected bank account.",
]);

function json(data, status, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function backendOrigin(env) {
  const configured = String(env?.BACKEND_ORIGIN || "").trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || !url.hostname ||
        url.username || url.password || url.pathname !== "/" ||
        url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function forwardingHeaders(request) {
  const headers = new Headers();
  // Only forward what the existing Render HMAC verifier needs.
  for (const name of ["content-type", "x-sepay-signature", "x-sepay-timestamp"]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return headers;
}

async function safeUpstreamError(response) {
  if (response.status < 400) return null;

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("json")) return "non_json_response";

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DIAGNOSTIC_RESPONSE_BYTES) {
    return "unrecognized_json_response";
  }

  const body = response.clone().body;
  if (!body) return "empty_response";

  const reader = body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_DIAGNOSTIC_RESPONSE_BYTES) {
        void reader.cancel().catch(() => {});
        return "unrecognized_json_response";
      }
      chunks.push(value);
    }
  } catch {
    return "unreadable_response";
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    const message = typeof payload?.message === "string" ? payload.message : "";
    return SAFE_UPSTREAM_MESSAGES.has(message) ? message : "unrecognized_json_response";
  } catch {
    return "invalid_json_response";
  }
}

async function logUpstreamResponse(logger, response) {
  const fields = {
    upstream_status: response.status,
    upstream_error: await safeUpstreamError(response),
  };
  if (response.status >= 400) {
    logger?.warn?.("[SePay webhook proxy] backend response", fields);
  } else {
    logger?.info?.("[SePay webhook proxy] backend response", fields);
  }
}

function upstreamResponse(response) {
  const headers = new Headers();
  for (const name of ["content-type", "retry-after"]) {
    const value = response.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set("cache-control", "no-store");
  const body = [204, 205, 304].includes(response.status) ? null : response.body;
  return new Response(body, { status: response.status, headers });
}

export function createWorker(fetchImpl = fetch, logger = console) {
  return {
    async fetch(request, env = {}) {
      const incoming = new URL(request.url);
      if (incoming.pathname === "/health") {
        if (request.method !== "GET") {
          return json({ success: false, message: "Method not allowed." }, 405, { allow: "GET" });
        }
        return json({ success: true, service: "maihoc-sepay-webhook-proxy" }, 200);
      }
      if (incoming.pathname !== WEBHOOK_PATH) {
        return json({ success: false, message: "Not found." }, 404);
      }
      if (request.method !== "POST") {
        return json({ success: false, message: "Method not allowed." }, 405, { allow: "POST" });
      }

      const origin = backendOrigin(env);
      if (!origin) {
        return json({ success: false, message: "BACKEND_ORIGIN must be a valid HTTPS origin." }, 503);
      }

      const declaredLength = request.headers.get("content-length");
      if (declaredLength !== null && /^\d+$/.test(declaredLength) &&
          Number(declaredLength) > MAX_BODY_BYTES) {
        return json({ success: false, message: "Webhook payload is too large." }, 413);
      }

      let rawBody;
      try {
        // Do not parse or stringify JSON: SePay signs the original bytes.
        rawBody = await request.arrayBuffer();
      } catch {
        return json({ success: false, message: "Could not read webhook request body." }, 400);
      }
      if (rawBody.byteLength > MAX_BODY_BYTES) {
        return json({ success: false, message: "Webhook payload is too large." }, 413);
      }

      try {
        const response = await fetchImpl(origin + WEBHOOK_PATH, {
          method: "POST",
          headers: forwardingHeaders(request),
          body: rawBody,
          redirect: "manual",
        });
        // Log only the upstream status and a strict allowlist of known-safe
        // backend messages. Never log request data, headers, or raw responses.
        await logUpstreamResponse(logger, response);
        // Keep the backend status and body so SePay's delivery log shows
        // the actual Render response rather than a synthetic proxy success.
        return upstreamResponse(response);
      } catch {
        return json({ success: false, message: "MAIHOC backend is temporarily unavailable." }, 502);
      }
    },
  };
}

export default createWorker();
