import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { setDefaultResultOrder } from "node:dns";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";

// Cloudflare publica IPv4 e IPv6 para el endpoint de R2. El VPS de producción
// resuelve ambas familias, pero no tiene una ruta IPv6 funcional. El handler del
// AWS SDK intentaba primero la AAAA y dejaba las subidas esperando hasta agotar
// el timeout; fotos, escaneos y PDFs parecían quedarse en "Procesando…" y nunca
// alcanzaban la base. Preferir IPv4 conserva IPv6 como respaldo y evita el
// bloqueo sin cambiar credenciales, llaves ni URLs guardadas.
setDefaultResultOrder("ipv4first");

// `ipv4first` mejora la resolución general, pero no obliga a todos los
// transportes a conservar ese orden. El handler de Smithy usa un agente propio,
// así que fijamos aquí la familia de la conexión real que utiliza el SDK. El
// agente se comparte entre llamadas para reutilizar conexiones TLS y evitar que
// cada foto pague de nuevo el costo de conexión.
export const R2_NETWORK_FAMILY = 4 as const;
const r2RequestHandler = new NodeHttpHandler({
  connectionTimeout: 5_000,
  socketTimeout: 30_000,
  httpsAgent: new https.Agent({
    family: R2_NETWORK_FAMILY,
    keepAlive: true,
    maxSockets: 50
  })
});

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
    credentials: { accessKeyId, secretAccessKey },
    requestHandler: r2RequestHandler
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

/**
 * Extrae la llave de R2 a partir de una URL pública guardada en la BD.
 *
 * Históricamente se guardó la URL pública completa (`https://pub-xxx.r2.dev/<key>`)
 * en vez de la llave. Este helper permite servir esos registros vía proxy o URL
 * firmada SIN migrar la base de datos.
 *
 * Devuelve null si la URL no es de R2 (enlaces externos, data: URIs, o rutas ya
 * convertidas a proxy) — el llamador debe dejarlas pasar tal cual.
 */
export function keyFromR2Url(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null; // rutas relativas (/api/...) o valores basura
  }
  if (parsed.protocol !== "https:") return null;
  const publicHost = (() => {
    const base = process.env.R2_PUBLIC_URL;
    if (!base) return "";
    try {
      return new URL(base).hostname;
    } catch {
      return "";
    }
  })();
  // Solo el dominio público del bucket. Las URLs ya firmadas apuntan al endpoint
  // S3 (<account>.r2.cloudflarestorage.com) y NO deben volver a firmarse.
  const isPublic = parsed.hostname === publicHost || parsed.hostname.endsWith(".r2.dev");
  if (!isPublic) return null;
  const key = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  if (!key || key.includes("..")) return null;
  return key;
}

/**
 * Vida de una URL firmada: 1 hora.
 *
 * `app-data` se refresca cada 5 min (y al volver a la pestaña), así que las
 * evidencias nunca alcanzan a caducar. Pero pantallas sin polling —capacitación,
 * por ejemplo— pintan el enlace una sola vez: con una ventana corta, abrir un PDF
 * un rato después daría 403. Una hora cubre esos casos sin dejar de ser temporal.
 */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * URL firmada de lectura para un objeto de R2. Recibe la URL pública guardada en
 * la BD (o una llave) y devuelve un enlace temporal servido directo por
 * Cloudflare — sin pasar por el VPS.
 *
 * Fail-soft: si no se puede firmar, devuelve el valor original para no romper la
 * pantalla (mientras el bucket siga público, la URL vieja aún funciona).
 */
export async function signR2Url(urlOrKey: string | null | undefined, ttlSeconds = SIGNED_URL_TTL_SECONDS): Promise<string | null> {
  if (!urlOrKey) return null;
  if (process.env.NODE_ENV === "test" || process.env.MOCK_EXTERNAL_SERVICES === "true") {
    return urlOrKey;
  }
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) return urlOrKey;
  // Acepta tanto una URL pública guardada como una llave suelta.
  const key = keyFromR2Url(urlOrKey) ?? (urlOrKey.startsWith("http") ? null : urlOrKey);
  if (!key) return urlOrKey; // enlace externo o ya firmado: se deja intacto
  try {
    return await getSignedUrl(createClient(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttlSeconds });
  } catch {
    return urlOrKey;
  }
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
