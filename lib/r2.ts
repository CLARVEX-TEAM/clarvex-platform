import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import fs from "node:fs";
import path from "node:path";

if (process.env.NODE_ENV === "test" || process.env.ALLOW_INTEGRATION_TEST_DATABASE === "true") {
  const envTestPath = path.resolve(process.cwd(), ".env.test");
  if (fs.existsSync(envTestPath)) {
    const lines = fs.readFileSync(envTestPath, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1];
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

function createClient() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Configura R2_ACCOUNT_ID, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY en .env.local");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });
}

function publicUrl(key: string) {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!base) throw new Error("Configura R2_PUBLIC_URL en .env.local");
  return `${base}/${key}`;
}

export async function uploadToR2(key: string, body: Uint8Array, contentType: string): Promise<string> {
  if (process.env.NODE_ENV === "test" || process.env.MOCK_EXTERNAL_SERVICES === "true") {
    return `http://localhost:3000/mock-r2/${key}`;
  }
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("Configura R2_BUCKET_NAME en .env.local");
  await createClient().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  return publicUrl(key);
}

export async function deleteFromR2(url: string): Promise<void> {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!base || !url.startsWith(base)) return;
  const key = url.slice(base.length + 1);
  if (!key) return;
  await deleteFromR2ByKey(key);
}

export async function deleteFromR2ByKey(key: string): Promise<void> {
  if (process.env.NODE_ENV === "test" || process.env.MOCK_EXTERNAL_SERVICES === "true") {
    return;
  }
  if (!key) return;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) return;
  await createClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
}

// Verifica conectividad y credenciales contra R2 (HeadBucket, sin descargar
// objetos). Para el endpoint de health-check. Fail-soft: devuelve false ante
// cualquier error en lugar de lanzar.
export async function checkR2Health(): Promise<boolean> {
  if (process.env.NODE_ENV === "test" || process.env.MOCK_EXTERNAL_SERVICES === "true") {
    return true;
  }
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) return false;
  try {
    await createClient().send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch {
    return false;
  }
}

// Lee un objeto del bucket usando las credenciales (no requiere acceso público).
export async function getFromR2(key: string): Promise<{ body: Uint8Array; contentType: string } | null> {
  if (process.env.NODE_ENV === "test" || process.env.MOCK_EXTERNAL_SERVICES === "true") {
    return { body: new Uint8Array([1, 2, 3]), contentType: "image/png" };
  }
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) return null;
  try {
    const res = await createClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return null;
    const body = await res.Body.transformToByteArray();
    return { body, contentType: res.ContentType ?? "application/octet-stream" };
  } catch {
    return null;
  }
}
