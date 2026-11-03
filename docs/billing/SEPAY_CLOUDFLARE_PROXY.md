# MAIHOC SePay webhook proxy (Cloudflare Worker)

## Why this is a separate Worker

The main MAIHOC Worker remains unchanged. This is a separately deployed, narrowly scoped Worker for the SePay webhook only. Its only job is to relay the request to the existing Render backend.

- Public path: `/api/billing/sepay/webhook`
- Backend destination: `https://maihoc-learning-system.onrender.com/api/billing/sepay/webhook`
- Allowed method: `POST`
- Maximum request body: 1 MiB
- Health check: `GET /health`

The proxy does not create orders, write to PostgreSQL, activate subscriptions, or mark payments as paid.

## Security and signature preservation

SePay signs the original request body. This Worker reads the body as bytes and forwards those exact bytes without JSON parsing or serialization. It forwards only:

- `Content-Type`
- `X-SePay-Signature`
- `X-SePay-Timestamp`

It does not forward browser cookies, Authorization, Host, client-IP, or arbitrary forwarding headers. It does not log request bodies, account numbers, signatures, timestamps, or transaction payloads.

The Worker does not store the HMAC secret. Keep `SEPAY_WEBHOOK_SECRET` only in Render. The Render backend remains responsible for HMAC-SHA256 verification, timestamp/replay protection, recipient-account validation, order-code matching, exact amount matching, transaction deduplication, and subscription activation.

## Deploy as a separate Worker

Run this command from the repository root. It does not deploy or replace the existing `maihoc-learning` Worker:

```powershell
npx wrangler deploy --config workers/sepay-webhook-proxy/wrangler.jsonc
```

Authenticate Wrangler with the Cloudflare account that owns the MAIHOC Workers project if prompted. Wrangler deploys a Worker named `maihoc-sepay-webhook-proxy` with its own `workers.dev` address.

The backend origin is configured in this Worker's config as `BACKEND_ORIGIN`. It must remain an HTTPS origin only (no path, query, username, or password). Change it only when the production backend origin changes.

After deployment, Cloudflare prints the Worker URL. It will have this form:

```text
https://maihoc-sepay-webhook-proxy.<your-workers-subdomain>.workers.dev
```

Use this URL in SePay, adding the webhook path:

```text
https://maihoc-sepay-webhook-proxy.<your-workers-subdomain>.workers.dev/api/billing/sepay/webhook
```

Do not guess the Workers subdomain; copy the exact URL printed by Wrangler or shown in Cloudflare Dashboard.

## Verify before changing SePay

1. Open `https://<worker-host>/health`. It should return HTTP 200 and `{"success":true,"service":"maihoc-sepay-webhook-proxy"}`. This checks that the Worker is live; it does not check Render.
2. Send an unsigned diagnostic POST through the Worker. The expected response is the Render backend's HTTP 401 `Invalid webhook signature.`. This confirms that the Worker forwarded the request to the correct backend. It does not create a transaction or activate a plan.

PowerShell diagnostic (replace the placeholder with the actual Worker host):

```powershell
$env:MAIHOC_PROXY_URL = "https://maihoc-sepay-webhook-proxy.<your-workers-subdomain>.workers.dev"
@'
const r = await fetch(
  process.env.MAIHOC_PROXY_URL + "/api/billing/sepay/webhook",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  }
);
console.log("HTTP:", r.status);
console.log("Response:", await r.text());
'@ | node --input-type=module
```

Expected response:

```text
HTTP: 401
{"success":false,"message":"Invalid webhook signature."}
```

## Switch the SePay webhook

Only after the diagnostic POST returns the expected backend 401:

1. Edit the existing SePay webhook; do not create a second active webhook for the same bank account unless you intentionally want duplicate deliveries.
2. Replace its URL with the full Cloudflare Worker URL ending in `/api/billing/sepay/webhook`.
3. Keep the event as incoming transfers.
4. Keep HMAC-SHA256 selected and keep the same Secret Key already configured as Render's `SEPAY_WEBHOOK_SECRET`.
5. Keep the correct bank account and avoid adding a payment-code prefix filter until the live flow is confirmed.
6. Save and use SePay's test-send action. Inspect the HTTP status and response body.

## Interpret the result

- `200`: Render accepted and recorded the webhook request. Confirm the order and subscription in PostgreSQL; HTTP 200 alone does not prove a payment matched.
- `401 Invalid webhook signature`: the Worker reached Render, but SePay's signature headers/secret/timestamp did not validate. Check the SePay HMAC configuration and Render secret.
- `403 Unexpected bank account`: the request reached the Billing handler, but its `accountNumber` did not match `SEPAY_ACCOUNT_NUMBER`. Do not weaken this validation; inspect the SePay payload/account selection.
- Plain-text `403 Forbidden` or `forbidden`: the request is being rejected outside the Billing JSON handler or by an upstream layer. Check Cloudflare Worker logs and Render HTTP request logs for the matching time.
- `502`: the Worker could not reach Render; check Render availability and Cloudflare Worker logs.
- `503`: the Worker has a missing or invalid `BACKEND_ORIGIN`.

SePay's test-send payload is synthetic and is not a real bank transaction. It must never activate a subscription by itself. After test-send, use SePay's replay feature for a previously failed real transfer where possible; do not ask the payer to transfer again before checking the original transaction.

## Tests

Run locally:

```powershell
npm run test:sepay-proxy
node --check workers/sepay-webhook-proxy/worker.js
```

The tests verify exact body-byte preservation, signature-header forwarding, stripping of unrelated sensitive headers, fixed backend routing, response pass-through, method/path restrictions, payload size limits, invalid configuration, and upstream failure handling.
