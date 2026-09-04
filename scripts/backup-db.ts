/**
 * Backup diario de PostgreSQL a Cloudflare R2.
 *
 * Uso (VPS, vía cron):
 *   cd /home/ubuntu/clarvex-app && pnpm exec tsx scripts/backup-db.ts
 *
 * - Hace pg_dump (formato custom, ya comprimido) dentro del contenedor Docker.
 * - Sube el archivo a R2 bajo backups/.
 * - Borra backups con más de BACKUP_RETENTION_DAYS días (default 30).
 *
 * BUCKET AISLADO (recomendado): configura BACKUP_R2_* para que los respaldos
 * vivan en un bucket propio, con su propio token de R2.
 *
 * Por qué importa: si los backups comparten bucket y credenciales con la app, la
 * MISMA llave que sube las fotos de perfil puede borrar los respaldos. Un VPS
 * comprometido (o un script en mal estado) podría destruir la base y las copias
 * de seguridad en una sola operación — que es justo lo que convierte un incidente
 * recuperable en uno terminal.
 *
 * Sin las BACKUP_R2_*, el script sigue funcionando con las credenciales de la app
 * (y lo avisa), para no romper instalaciones existentes.
 *
 * Restaurar (¡solo en una emergencia real y con calma!):
 *   docker exec -i clarvex_postgres pg_restore -d "$DB" --clean --if-exists < archivo.dump
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { EstadoRespaldo, ResultadoDestino } from "../lib/backup-estado";

const CONTAINER = process.env.BACKUP_PG_CONTAINER ?? "clarvex_postgres";
const PREFIX = "backups/";
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);

// Cron no carga .env: si faltan variables, leerlas del .env del proyecto.
function ensureEnv() {
  if (process.env.DATABASE_URL && process.env.R2_ACCOUNT_ID) return;
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] === undefined) process.env[key] = raw.replace(/^"|"$/g, "");
  }
}

function dumpDatabase(databaseUrl: string): Promise<Buffer> {
  // psql/pg_dump no aceptan el parámetro ?schema= de Prisma.
  const cleanUrl = databaseUrl.replace(/\?.*$/, "");
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", CONTAINER, "pg_dump", cleanUrl, "--format=custom"], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`pg_dump salió con código ${code}: ${stderr.trim()}`));
      resolve(Buffer.concat(chunks));
    });
  });
}

/**
 * Destino de los respaldos. Si están las BACKUP_R2_*, se usa un bucket aislado
 * con su propio token; si no, cae a las credenciales de la app (y avisa).
 */
function backupTarget() {
  const ownBucket = process.env.BACKUP_R2_BUCKET_NAME;
  const ownKey = process.env.BACKUP_R2_ACCESS_KEY_ID;
  const ownSecret = process.env.BACKUP_R2_SECRET_ACCESS_KEY;
  // Aislado de verdad solo si trae bucket Y credenciales propias: un bucket
  // distinto con la llave de la app no protege de nada (esa llave lo borraría).
  const isolated = Boolean(ownBucket && ownKey && ownSecret);
  return {
    isolated,
    accountId: process.env.BACKUP_R2_ACCOUNT_ID ?? process.env.R2_ACCOUNT_ID,
    bucket: ownBucket ?? process.env.R2_BUCKET_NAME,
    accessKeyId: ownKey ?? process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: ownSecret ?? process.env.R2_SECRET_ACCESS_KEY
  };
}

async function main() {
  ensureEnv();
  const databaseUrl = process.env.DATABASE_URL;
  const { isolated, accountId, bucket, accessKeyId, secretAccessKey } = backupTarget();
  if (!databaseUrl || !accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Faltan DATABASE_URL o credenciales R2 en el entorno/.env");
  }

  if (isolated) {
    console.log(`[backup] bucket aislado: ${bucket} (credenciales propias)`);
  } else {
    console.warn(
      "[backup] ⚠️  Los respaldos van al MISMO bucket y con las MISMAS credenciales que la app.\n" +
      "[backup] ⚠️  Esa llave puede borrar la base Y los backups de un tirón. Configura\n" +
      "[backup] ⚠️  BACKUP_R2_BUCKET_NAME / BACKUP_R2_ACCESS_KEY_ID / BACKUP_R2_SECRET_ACCESS_KEY."
    );
  }

  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const key = `${PREFIX}clarvex_team-${stamp}.dump`;

  console.log(`[backup] pg_dump desde contenedor ${CONTAINER}...`);
  const dump = await dumpDatabase(databaseUrl);
  if (dump.length < 1024) throw new Error(`El dump pesa solo ${dump.length} bytes: algo salió mal, no se sube.`);
  console.log(`[backup] dump listo: ${(dump.length / 1024 / 1024).toFixed(2)} MB`);

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });

  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: dump, ContentType: "application/octet-stream" }));
  console.log(`[backup] subido a r2://${bucket}/${key}`);

  // Retención: borrar backups viejos.
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX }));
  let deleted = 0;
  for (const object of listed.Contents ?? []) {
    if (object.Key && object.LastModified && object.LastModified.getTime() < cutoff) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }));
      deleted += 1;
    }
  }
  console.log(`[backup] retención ${RETENTION_DAYS} días: ${deleted} backup(s) viejos borrados. Total OK.`);

  const resultadoS3 = await copyToS3(key, dump);

  escribirEstado({
    terminadoEn: new Date().toISOString(),
    r2: { estado: "ok", objeto: `r2://${bucket}/${key}`, bytes: dump.length },
    s3: resultadoS3
  });
}

/**
 * Segunda copia en Amazon S3, en OTRA nube.
 *
 * Por qué una segunda copia y no una retención más larga en R2: hoy los
 * respaldos y las fotos viven en el mismo proveedor. Si esa cuenta se
 * compromete, o alguien vacía el bucket, se van los datos **y** las copias en
 * el mismo movimiento. Una copia en otro proveedor, con otras credenciales, es
 * la que sobrevive a eso.
 *
 * ⚠️ Estas credenciales **solo pueden escribir** (`s3:PutObject`). No pueden
 * listar, leer ni borrar. Por eso la retención NO se hace aquí: la aplica una
 * regla de ciclo de vida del propio bucket, del lado de AWS. Si el script
 * pudiera borrar, un servidor comprometido podría vaciar el respaldo remoto —
 * que es exactamente de lo que esta copia protege.
 *
 * Nunca lanza: si S3 falla, el respaldo de R2 ya está hecho y ese es el que
 * corre a diario. Tumbar el cron por la copia secundaria sería cambiar una
 * protección por otra.
 */
async function copyToS3(key: string, dump: Buffer): Promise<ResultadoDestino> {
  const bucket = process.env.BACKUP_S3_BUCKET ?? "";
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY ?? "";
  if (!bucket || !accessKeyId || !secretAccessKey) {
    console.log("[backup] sin copia en S3 (BACKUP_S3_* no configurado).");
    return { estado: "sin-configurar" };
  }

  try {
    const s3 = new S3Client({
      region: process.env.BACKUP_S3_REGION ?? "us-east-1",
      credentials: { accessKeyId, secretAccessKey }
    });
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: dump,
        ContentType: "application/octet-stream"
      })
    );
    console.log(`[backup] copia cruzada en s3://${bucket}/${key}`);
    return { estado: "ok", objeto: `s3://${bucket}/${key}`, bytes: dump.length };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[backup] ⚠️  La copia en S3 falló: ${detail}`);
    console.warn("[backup] ⚠️  El respaldo de R2 SÍ se hizo. Revisa las credenciales BACKUP_S3_*.");
    return { estado: "fallo", error: detail };
  }
}

/**
 * Escribe el resultado de ESTA ejecucion, por destino.
 *
 * ⚠️ Se sobrescribe entero a proposito. El monitor antes buscaba una linea en
 * las ultimas veinte del registro, asi que un fallo de hoy quedaba tapado por un
 * exito de ayer mientras siguiera visible. Aqui lo que se lee es siempre la
 * ultima corrida.
 *
 * Que no se pueda escribir NO tumba el respaldo --ya esta hecho-- pero se avisa:
 * un monitor ciego es peor que uno ruidoso.
 */
function escribirEstado(estado: EstadoRespaldo): void {
  const ruta = process.env.BACKUP_ESTADO_PATH ?? "/home/ubuntu/logs/backup-estado.json";
  try {
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, `${JSON.stringify(estado, null, 2)}\n`, "utf8");
    console.log(`[backup] estado escrito en ${ruta}`);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.warn(`[backup] ⚠️  No se pudo escribir el estado en ${ruta}: ${detalle}`);
    console.warn("[backup] ⚠️  El respaldo SI se hizo, pero el monitor no va a poder verlo.");
  }
}

main().catch((error) => {
  console.error("[backup] FALLÓ:", error instanceof Error ? error.message : error);
  process.exit(1);
});
