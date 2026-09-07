import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, realpath, rename, rmdir, statfs, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { PosVisionAttempt } from "@/lib/pos-vision-diagnostics";

export const POS_HISTORY_DAYS = 7;
const RETENTION_MS = POS_HISTORY_DAYS * 86_400_000;
const MAX_FILE_BYTES = 18_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FILE = /^([0-9a-f-]{36})\.json$/;
const PENDING = /^\.([0-9a-f-]{36})\.pending$/;
const mimeSchema = z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const stageSchema = z.enum(["vision", "validation", "matching"]);
const recordSchema = z.object({
  version: z.literal(1), id: z.string().regex(UUID), createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  storeId: z.string().min(1).max(64), mimeType: mimeSchema,
  stage: stageSchema, error: z.string().max(12_000), source: z.literal("capture-backend"),
  actorVerified: z.literal(false), sha256: z.string().regex(/^[0-9a-f]{64}$/),
  documentBase64: z.string().max(12_000_000),
  attempts: z.array(z.object({
    provider: z.enum(["bedrock", "gemini"]), model: z.string().max(200), startedAt: z.iso.datetime(),
    durationMs: z.number().nonnegative(), text: z.string().max(100_000).nullable(), textTruncated: z.boolean(),
    accepted: z.boolean(), problem: z.string().max(12_000).nullable()
  })).max(8)
});
export type PosFailure = z.infer<typeof recordSchema>;
export type PosFailureSummary = Pick<PosFailure, "id" | "createdAt" | "expiresAt" | "storeId" | "mimeType" | "stage" | "error">;
type FailureInput = {
  storeId: string; mimeType: z.infer<typeof mimeSchema>; stage: z.infer<typeof stageSchema>;
  error: string; documentBase64: string; attempts: PosVisionAttempt[];
};

function missing(error: unknown) { return (error as NodeJS.ErrnoException)?.code === "ENOENT"; }
function inside(root: string, child: string) {
  const relative = path.relative(root, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
export function decodePosDocument(base64: string): Buffer {
  if (!base64 || base64.length > 12_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("Documento base64 inválido.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64").replace(/=+$/, "") !== base64.replace(/=+$/, "")) {
    throw new Error("Documento base64 inválido.");
  }
  return bytes;
}

/** Un host, varios workers PM2. Sin R2 público, Prisma, credenciales ni directorios de release. */
export function createPosFailureStore(options: {
  directory: string; now?: () => number; maxBytes?: number; maxRecords?: number;
}) {
  if (!path.isAbsolute(options.directory)) throw new Error("El historial requiere una ruta absoluta privada.");
  const root = path.resolve(options.directory);
  const now = options.now ?? Date.now;
  const maxBytes = options.maxBytes ?? 128 * 1024 * 1024;
  const maxRecords = options.maxRecords ?? 100;
  if (maxBytes < 1 || maxRecords < 1) throw new Error("Límites de historial inválidos.");

  async function ready(create: boolean): Promise<boolean> {
    // Se rechaza TODO el checkout: ni public/, ni .next/, ni un fichero que termine en Git.
    const cwd = await realpath(process.cwd());
    if (inside(cwd, root)) throw new Error("El historial debe estar fuera del proyecto.");
    if (create) await mkdir(root, { recursive: true, mode: 0o700 });
    try {
      const info = await lstat(root);
      if (!info.isDirectory() || info.isSymbolicLink() || inside(cwd, await realpath(root))) {
        throw new Error("La carpeta de historial no es privada.");
      }
      if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
        throw new Error("La carpeta de historial requiere permisos 0700.");
      }
      return true;
    } catch (error) { if (missing(error) && !create) return false; throw error; }
  }

  async function files() {
    const entries: Array<{ name: string; bytes: number; modified: number; pending: boolean }> = [];
    for (const name of await readdir(root)) {
      const match = FILE.exec(name) ?? PENDING.exec(name);
      if (!match || !UUID.test(match[1])) continue;
      try {
        const info = await lstat(path.join(root, name));
        if (info.isFile() && !info.isSymbolicLink()) {
          entries.push({ name, bytes: info.size, modified: info.mtimeMs, pending: name.startsWith(".") });
        }
      } catch (error) { if (!missing(error)) throw error; }
    }
    return entries.sort((a, b) => a.modified - b.modified || a.name.localeCompare(b.name));
  }

  async function remove(name: string) {
    // Solo recibe nombres generados o enumerados con UUID. Nunca borrado recursivo.
    try { await unlink(path.join(root, name)); } catch (error) { if (!missing(error)) throw error; }
  }

  async function locked<T>(work: () => Promise<T>): Promise<T> {
    const lock = path.join(root, ".writer-lock");
    let acquired = false;
    for (let i = 0; i < 20; i++) {
      try { await mkdir(lock, { mode: 0o700 }); acquired = true; break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    if (!acquired) throw new Error("Historial ocupado; no se guardó el diagnóstico.");
    try { return await work(); } finally { await rmdir(lock); }
  }

  async function prune(reserve = 0) {
    const retained = [];
    for (const entry of await files()) {
      if (entry.pending || entry.modified <= now() - RETENTION_MS) await remove(entry.name);
      else retained.push(entry);
    }
    let bytes = retained.reduce((sum, entry) => sum + entry.bytes, 0);
    while (retained.length > maxRecords - (reserve ? 1 : 0) || bytes + reserve > maxBytes) {
      const entry = retained.shift();
      if (!entry) break;
      await remove(entry.name);
      bytes -= entry.bytes;
    }
  }

  async function read(id: string): Promise<PosFailure | null> {
    if (!UUID.test(id) || !await ready(false)) return null;
    let handle;
    try {
      const filename = path.join(root, `${id}.json`);
      const info = await lstat(filename);
      if (!info.isFile() || info.isSymbolicLink()) return null;
      handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      if ((await handle.stat()).size > MAX_FILE_BYTES) throw new Error("Diagnóstico dañado.");
      const record = recordSchema.parse(JSON.parse(await handle.readFile("utf8")));
      if (record.id !== id || Date.parse(record.expiresAt) !== Date.parse(record.createdAt) + RETENTION_MS) {
        throw new Error("Diagnóstico dañado.");
      }
      if (Date.parse(record.expiresAt) <= now()) return null;
      if (createHash("sha256").update(decodePosDocument(record.documentBase64)).digest("hex") !== record.sha256) {
        throw new Error("El original no coincide con su huella.");
      }
      return record;
    } catch (error) { if (missing(error)) return null; throw error; }
    finally { await handle?.close(); }
  }

  return {
    read,
    async save(input: FailureInput): Promise<string> {
      const bytes = decodePosDocument(input.documentBase64);
      const timestamp = now();
      const record = recordSchema.parse({
        ...input, error: input.error.slice(0, 12_000), version: 1, id: randomUUID(),
        createdAt: new Date(timestamp).toISOString(), expiresAt: new Date(timestamp + RETENTION_MS).toISOString(),
        source: "capture-backend", actorVerified: false, sha256: createHash("sha256").update(bytes).digest("hex")
      });
      const contents = JSON.stringify(record);
      const size = Buffer.byteLength(contents);
      if (size > MAX_FILE_BYTES || size > maxBytes) throw new Error("Diagnóstico demasiado grande.");
      await ready(true);
      return locked(async () => {
        const disk = await statfs(root);
        if (disk.bavail * disk.bsize < size + 256 * 1024 * 1024) throw new Error("Sin espacio para el diagnóstico.");
        await prune(size);
        const pending = `.${record.id}.pending`;
        const handle = await open(path.join(root, pending), "wx", 0o600);
        try {
          await handle.writeFile(contents, "utf8");
          await handle.utimes(new Date(timestamp), new Date(timestamp));
          await handle.sync();
        }
        finally { await handle.close(); }
        // Publicación atómica: los lectores nunca ven media imagen o medio JSON.
        await rename(path.join(root, pending), path.join(root, `${record.id}.json`));
        await chmod(path.join(root, `${record.id}.json`), 0o600);
        return record.id;
      });
    },
    async list(storeId?: string): Promise<PosFailureSummary[]> {
      if (!await ready(false)) return [];
      const summaries: PosFailureSummary[] = [];
      for (const entry of (await files()).reverse()) {
        if (entry.pending) continue;
        const record = await read(entry.name.slice(0, -5));
        if (!record || (storeId && record.storeId !== storeId)) continue;
        const { id, createdAt, expiresAt, mimeType, stage, error } = record;
        summaries.push({ id, createdAt, expiresAt, mimeType, stage, error, storeId: record.storeId });
        if (summaries.length >= 100) break;
      }
      return summaries;
    },
    async prune() {
      if (await ready(false)) await locked(() => prune());
    }
  };
}

export function posFailureStore() {
  return createPosFailureStore({
    directory: process.env.POS_DIAGNOSTICS_DIR ?? path.join(homedir(), ".local", "share", "clarvex", "pos-diagnostics")
  });
}
