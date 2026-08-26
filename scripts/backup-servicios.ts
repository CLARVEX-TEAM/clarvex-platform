/**
 * Backup diario de los SERVICIOS de al lado (no de la base de la app).
 *
 * Uso (VPS, vía cron):
 *   cd /home/ubuntu/clarvex-app && pnpm exec tsx scripts/backup-servicios.ts
 *
 * POR QUE EXISTE: hasta el 26 de agosto de 2026 el unico respaldo era el
 * `pg_dump` de Postgres. Vaultwarden --el gestor de contraseñas-- no tenia NI
 * UNA copia, ni n8n con sus flujos y credenciales, ni Nginx Proxy Manager con
 * los certificados y toda la configuracion de los proxys. Vivian en un solo
 * disco. Reconstruir eso a mano es una tarde entera con el sitio caido, y las
 * contraseñas directamente no se reconstruyen.
 *
 * ⚠️ LO IMPORTANTE: estas bases estan en modo WAL y NO se pueden copiar con
 * `cp`. Medido en produccion, Vaultwarden tenia 876 KB en `db.sqlite3` y 4.1 MB
 * en `db.sqlite3-wal`: una copia plana se lleva el archivo pequeño y deja fuera
 * casi todos los cambios recientes. El respaldo pesaria lo suyo, parece
 * correcto, y al restaurar faltan las contraseñas mas nuevas. Por eso se usa
 * `sqlite3 .backup`, que es la copia en caliente oficial y fusiona el WAL.
 *
 * ⚠️ Y por eso mismo NO se guardan los `-wal` ni los `-shm`: su contenido ya
 * esta dentro de la copia fusionada. Meterlos ademas solo puede confundir una
 * restauracion futura con un WAL que ya no corresponde a esa base.
 *
 * ⚠️ ESTE RESPALDO ES TAN SENSIBLE COMO LOS SECRETOS QUE CONTIENE. La llave de
 * cifrado de n8n (`n8n_data/config`) viaja junto a las credenciales que cifra:
 * es inevitable, porque sin ella la restauracion no sirve de nada. Va al bucket
 * aislado por ese motivo. Lo de Vaultwarden es distinto: sus datos van cifrados
 * del lado del cliente con la contraseña maestra, que no esta aqui.
 *
 * Restaurar (¡solo en una emergencia real y con calma!):
 *   1. docker compose stop <servicio>
 *   2. tar xzf servicios-AAAA-MM-DD.tar.gz -C /tmp/restaurar
 *   3. copiar la carpeta del servicio sobre /home/ubuntu/stack/<servicio>
 *   4. BORRAR los `-wal` y `-shm` que hubiera quedado del original
 *   5. docker compose up -d <servicio>
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const STACK = process.env.BACKUP_STACK_DIR ?? "/home/ubuntu/stack";
const PREFIX = "backups-servicios/";
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);

/**
 * Que se copia de cada servicio.
 *
 * `dbs` son rutas relativas a bases SQLite: se copian con `sqlite3 .backup`.
 * `excluir` son patrones que NO entran, siempre por el mismo motivo: se
 * regeneran solos y solo abultan el respaldo diario.
 */
const SERVICIOS = [
  {
    nombre: "vaultwarden",
    dbs: ["db.sqlite3"],
    // icon_cache son los favicon de los sitios guardados: se vuelven a bajar.
    excluir: ["icon_cache"]
  },
  {
    nombre: "n8n_data",
    dbs: ["database.sqlite"],
    excluir: [".cache"]
  },
  {
    nombre: "npm",
    dbs: ["data/database.sqlite"],
    // letsencrypt SI entra: son los certificados y su estado de renovacion.
    excluir: []
  },
  {
    nombre: "uptime-kuma",
    dbs: ["kuma.db"],
    excluir: []
  },
  {
    nombre: "syncthing",
    // No tiene SQLite. Lo que importa es config.xml y el par de claves: el
    // identificador del dispositivo SALE de esa clave, asi que perderla
    // significa volver a emparejar todos los aparatos a mano.
    dbs: [],
    excluir: ["index-v0.14.0.db"]
  }
] as const;

// Cron no carga .env: si faltan variables, leerlas del .env del proyecto.
function ensureEnv() {
  if (process.env.R2_ACCOUNT_ID) return;
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] === undefined) process.env[key] = raw.replace(/^"|"$/g, "");
  }
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { err += c.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`${cmd} salió con código ${code}: ${err.trim() || out.trim()}`));
      resolve(out);
    });
  });
}

/**
 * Copia en caliente de una base SQLite, verificada.
 *
 * El `integrity_check` no es ceremonia: un respaldo corrupto se ve igual que
 * uno bueno hasta el dia que hace falta. Si no dice `ok`, se aborta y NO se
 * sube nada — mejor quedarse con el respaldo de ayer que reemplazarlo por uno
 * roto.
 */
async function copiarSqlite(origen: string, destino: string): Promise<void> {
  await run("sqlite3", [origen, `.backup '${destino}'`]);
  const check = (await run("sqlite3", [destino, "PRAGMA integrity_check;"])).trim();
  if (check !== "ok") {
    throw new Error(`La copia de ${origen} no pasó integrity_check: ${check}`);
  }
}

/** Destino de los respaldos: mismo criterio que scripts/backup-db.ts. */
function backupTarget() {
  const ownBucket = process.env.BACKUP_R2_BUCKET_NAME;
  const ownKey = process.env.BACKUP_R2_ACCESS_KEY_ID;
  const ownSecret = process.env.BACKUP_R2_SECRET_ACCESS_KEY;
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
  const { isolated, accountId, bucket, accessKeyId, secretAccessKey } = backupTarget();
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Faltan credenciales R2 en el entorno/.env");
  }
  if (!isolated) {
    console.warn("[servicios] ⚠️  Sin BACKUP_R2_*: los respaldos comparten llave con la app.");
  }

  const staging = mkdtempSync(join(tmpdir(), "backup-servicios-"));
  try {
    for (const svc of SERVICIOS) {
      const origen = join(STACK, svc.nombre);
      if (!existsSync(origen)) {
        console.warn(`[servicios] ⚠️  ${svc.nombre} no existe en ${STACK}, se omite.`);
        continue;
      }
      const destino = join(staging, svc.nombre);

      // Se copia con rsync y no con `cp` porque hay que EXCLUIR de verdad:
      //   - los `-wal` y `-shm`, cuyo contenido ya queda dentro de la copia
      //     fusionada que hace `.backup` mas abajo;
      //   - las bases vivas, que se sustituyen por esa copia en caliente;
      //   - los caches, que se regeneran solos.
      const exclusiones = ["*-wal", "*-shm", ...svc.excluir, ...svc.dbs].map((p) => `--exclude=${p}`);
      await run("rsync", ["-a", ...exclusiones, `${origen}/`, `${destino}/`]);

      for (const db of svc.dbs) {
        const rutaOrigen = join(origen, db);
        if (!existsSync(rutaOrigen)) {
          console.warn(`[servicios] ⚠️  ${svc.nombre}: no encuentro ${db}, se omite.`);
          continue;
        }
        await copiarSqlite(rutaOrigen, join(destino, db));
        console.log(`[servicios] ${svc.nombre}/${db}: copia en caliente verificada.`);
      }
    }

    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
    const key = `${PREFIX}servicios-${stamp}.tar.gz`;
    const archivo = join(staging, "..", `servicios-${stamp}.tar.gz`);
    await run("tar", ["-czf", archivo, "-C", staging, "."]);

    const tam = statSync(archivo).size;
    // Mismo criterio que el respaldo de la base: un archivo diminuto significa
    // que algo salio mal, y subirlo pisaria el respaldo bueno de ayer.
    if (tam < 100 * 1024) {
      throw new Error(`El archivo pesa solo ${tam} bytes: algo salió mal, no se sube.`);
    }
    const cuerpo = readFileSync(archivo);
    rmSync(archivo, { force: true });
    console.log(`[servicios] archivo listo: ${(tam / 1024 / 1024).toFixed(2)} MB`);

    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey }
    });
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: cuerpo, ContentType: "application/gzip" }));
    console.log(`[servicios] subido a r2://${bucket}/${key}`);

    const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX }));
    let deleted = 0;
    for (const object of listed.Contents ?? []) {
      if (object.Key && object.LastModified && object.LastModified.getTime() < cutoff) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }));
        deleted += 1;
      }
    }
    console.log(`[servicios] retención ${RETENTION_DAYS} días: ${deleted} respaldo(s) viejos borrados.`);

    await copiarAS3(key, cuerpo);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Segunda copia en Amazon S3, en OTRA nube. Mismo razonamiento que en
 * scripts/backup-db.ts: si la cuenta de Cloudflare se compromete, se irian los
 * datos y las copias en el mismo movimiento.
 *
 * ⚠️ Esas credenciales SOLO pueden escribir, asi que la retencion no se hace
 * aqui sino con una regla de ciclo de vida del bucket. Nunca lanza: si S3
 * falla, el respaldo de R2 ya esta hecho.
 */
async function copiarAS3(key: string, cuerpo: Buffer): Promise<void> {
  const bucket = process.env.BACKUP_S3_BUCKET ?? "";
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY ?? "";
  if (!bucket || !accessKeyId || !secretAccessKey) {
    console.log("[servicios] sin copia en S3 (BACKUP_S3_* no configurado).");
    return;
  }
  try {
    const s3 = new S3Client({
      region: process.env.BACKUP_S3_REGION ?? "us-east-1",
      credentials: { accessKeyId, secretAccessKey }
    });
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: cuerpo, ContentType: "application/gzip" }));
    console.log(`[servicios] copia cruzada en s3://${bucket}/${key}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[servicios] ⚠️  La copia en S3 falló: ${detail}`);
    console.warn("[servicios] ⚠️  El respaldo de R2 SÍ se hizo.");
  }
}

main().catch((error) => {
  console.error("[servicios] FALLÓ:", error instanceof Error ? error.message : error);
  process.exit(1);
});
