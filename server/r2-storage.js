import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
dotenv.config();

function cleanEnv(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .trim();
}

const R2_ACCOUNT_ID = cleanEnv(process.env.R2_ACCOUNT_ID);
const R2_BUCKET_NAME = cleanEnv(process.env.R2_BUCKET_NAME);
const R2_ACCESS_KEY_ID = cleanEnv(process.env.R2_ACCESS_KEY_ID);
const R2_SECRET_ACCESS_KEY = cleanEnv(process.env.R2_SECRET_ACCESS_KEY);

function resolveR2Endpoint(rawEndpoint, accountId, bucketName) {
  let endpoint = cleanEnv(rawEndpoint);
  if (!endpoint && accountId) {
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  }
  endpoint = endpoint.replace(/\/+$/, "");
  if (bucketName && endpoint.toLowerCase().endsWith(`/${bucketName.toLowerCase()}`)) {
    endpoint = endpoint.slice(0, -(bucketName.length + 1)).replace(/\/+$/, "");
  }
  return endpoint;
}

const R2_ENDPOINT = resolveR2Endpoint(
  process.env.R2_ENDPOINT,
  R2_ACCOUNT_ID,
  R2_BUCKET_NAME
);

const missing = [
  ["R2_ACCOUNT_ID", R2_ACCOUNT_ID],
  ["R2_BUCKET_NAME", R2_BUCKET_NAME],
  ["R2_ACCESS_KEY_ID", R2_ACCESS_KEY_ID],
  ["R2_SECRET_ACCESS_KEY", R2_SECRET_ACCESS_KEY],
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  throw new Error(`Missing R2 environment variables: ${missing.join(", ")}`);
}

export const r2 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export async function uploadToR2({
  key,
  body,
  contentType = "application/octet-stream",
}) {
  if (!key || body == null) {
    throw new Error("R2 upload requires a key and a body");
  }

  const normalizedBody = Buffer.isBuffer(body)
    ? body
    : body instanceof Uint8Array
      ? Buffer.from(body)
      : Buffer.from(String(body));

  if (!normalizedBody.byteLength) {
    throw new Error("R2 upload body cannot be empty");
  }

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: normalizedBody,
      ContentType: contentType,
      ContentLength: normalizedBody.byteLength,
    })
  );

  console.log(`[R2] Uploaded object to bucket "${R2_BUCKET_NAME}": ${key} (${normalizedBody.byteLength} bytes)`);
  return { key, bucket: R2_BUCKET_NAME, bytes: normalizedBody.byteLength };
}

export async function readFromR2(key) {
  const result = await r2.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );

  return result;
}

export async function deleteFromR2(key) {
  await r2.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );
}