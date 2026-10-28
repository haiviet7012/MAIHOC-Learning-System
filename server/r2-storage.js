import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const {
  R2_ACCOUNT_ID,
  R2_BUCKET_NAME,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
} = process.env;

const R2_ENDPOINT =
  process.env.R2_ENDPOINT ||
  (R2_ACCOUNT_ID
    ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : "");

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
  if (!key || !body) {
    throw new Error("R2 upload requires a key and a body");
  }

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return { key, bucket: R2_BUCKET_NAME };
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