import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "./r2-storage.js";

const bucket = process.env.R2_BUCKET_NAME;
const key = `health-check/${Date.now()}.txt`;
const expected = "MAIHOC R2 connection test";

try {
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: expected,
      ContentType: "text/plain; charset=utf-8",
    })
  );

  console.log("1. Upload R2: SUCCESS");

  const result = await r2.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  const actual = await result.Body.transformToString();

  if (actual !== expected) {
    throw new Error("Downloaded content does not match uploaded content");
  }

  console.log("2. Read R2: SUCCESS");

  await r2.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  console.log("3. Delete R2: SUCCESS");
  console.log("R2 connection test completed successfully.");
} catch (error) {
  console.error("R2 connection test failed:", error.message);
  process.exitCode = 1;
}

