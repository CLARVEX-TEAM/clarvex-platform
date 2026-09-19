import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { canUseChecklist } from "@/lib/access-control";
import { enforceUploadRateLimit, isApiError, requireSession } from "@/lib/api";
import { getStoreChecklistItem, loadStoreChecklistItems } from "@/lib/checklist-store";
import { scanRole } from "@/lib/checklist-scan";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { claveDeLaPeticion, conIdempotencia } from "@/lib/idempotencia-db";
import { prisma } from "@/lib/prisma";
import { validateProfilePhoto } from "@/lib/profile-photo";
import { deleteFromR2, signR2Url, uploadToR2 } from "@/lib/r2";
import { storeKey } from "@/lib/r2-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveDate(value: string | null): string {
  return value && DATE_RE.test(value) ? value : resolveMonterreyDate().dateKey;
}

/**
 * Sube UNA página de un escaneo del cierre. Se pueden subir varias por documento;
 * después se juntan en un PDF (ver ./pdf). Aquí la foto solo se GUARDA: el PDF es
 * lo que va a Telegram, no las páginas sueltas.
 *
 * Solo JPG/PNG: el PDF se arma con pdf-lib, que no incrusta WEBP.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (!canUseChecklist(session)) return NextResponse.json({ error: "No tienes permiso." }, { status: 403 });
  const limited = await enforceUploadRateLimit(session.userId);
  if (limited) return limited;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Formulario inválido." }, { status: 400 });

  const itemKey = String(form.get("itemKey") ?? "");
  const def = await getStoreChecklistItem(session.storeId, itemKey);
  if (!def || def.kind !== "scan") return NextResponse.json({ error: "Ítem de escaneo no válido." }, { status: 400 });
  const date = resolveDate(typeof form.get("date") === "string" ? String(form.get("date")) : null);

  const imageFile = form.get("image");
  if (!(imageFile instanceof File) || imageFile.size === 0) {
    return NextResponse.json({ error: "Adjunta una foto." }, { status: 400 });
  }
  const bytes = new Uint8Array(await imageFile.arrayBuffer());
  const validation = validateProfilePhoto(imageFile, bytes);
  if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });
  if (validation.extension === "webp") {
    return NextResponse.json({ error: "Usa JPG o PNG para los escaneos (el PDF no admite WEBP)." }, { status: 400 });
  }

  /*
   * ⚠️ **Desde aquí todo va dentro de la guarda de idempotencia**, subida
   * incluida.
   *
   * Repetir esta petición NO es inofensivo: cada intento sube un objeto nuevo a
   * R2 --el nombre lleva `Date.now()`-- y crea otra fila, así que la misma
   * página acabaría DOS VECES dentro del PDF del cierre. Es justo lo que hace
   * una cola sin conexión al reintentar desde la tienda, y nadie lo notaría
   * hasta abrir el PDF entregado.
   *
   * Sin cabecera `Idempotency-Key` se comporta igual que siempre: la guarda se
   * añade a quien la pide y no se le impone a lo que ya funciona.
   */
  /*
   * ⚠️ Capturados aquí y no dentro: en una función anidada TypeScript pierde el
   * estrechamiento que dieron `isApiError` y la comprobación de `def`.
   */
  const sesion = session;
  const definicion = def;
  const archivo = imageFile;
  const extension = validation.extension;
  const resultado = await conIdempotencia(
    {
      clave: claveDeLaPeticion(request),
      storeId: session.storeId,
      userId: session.userId,
      route: "/api/checklist/scan",
      // La huella de la foto distingue dos páginas distintas del mismo ítem.
      cuerpo: { itemKey, date, huellaImagen: createHash("sha256").update(bytes).digest("hex") }
    },
    async () => guardarPagina()
  );
  return NextResponse.json(resultado.body, { status: resultado.status });

  async function guardarPagina(): Promise<{ status: number; body: unknown }> {
  const key = storeKey(sesion.storeId, "checklist", `${itemKey}-${Date.now()}.${extension}`);
  let url: string;
  try {
    url = await uploadToR2(key, bytes, archivo.type);
  } catch {
    return { status: 500, body: { error: "No se pudo subir la foto." } };
  }

  let scan;
  try {
    scan = await prisma.checklistScan.create({
      data: { storeId: sesion.storeId, date, itemKey, url, fileName: archivo.name.slice(0, 255), uploadedById: sesion.userId }
    });
  } catch (error) {
    await deleteFromR2(url).catch(() => undefined);
    throw error;
  }

  // Si es la tarea de VOUCHERS, la misma página se copia también a la tarea de
  // CIERRE (corte de caja), para no escanear los vouchers dos veces. Es una copia
  // INDEPENDIENTE (su propio objeto en R2 y su propio registro): borrarla en el
  // cierre no toca el PDF de vouchers, y viceversa. Best-effort: si el copiado
  // falla, el voucher YA quedó guardado.
  if (scanRole(definicion.label) === "vouchers") {
    const items = await loadStoreChecklistItems(sesion.storeId);
    const cierre = items.find((item) => item.kind === "scan" && scanRole(item.label) === "cierre");
    if (cierre) {
      try {
        const copyKey = storeKey(sesion.storeId, "checklist", `${cierre.key}-${Date.now()}-copia.${extension}`);
        const copyUrl = await uploadToR2(copyKey, bytes, archivo.type);
        await prisma.checklistScan.create({
          data: { storeId: sesion.storeId, date, itemKey: cierre.key, url: copyUrl, fileName: archivo.name.slice(0, 255), uploadedById: sesion.userId }
        });
      } catch {
        // El voucher ya se guardó; que falle la copia al cierre no rompe la subida.
      }
    }
  }

  return {
    status: 201,
    body: {
      scan: { id: scan.id, itemKey: scan.itemKey, fileName: scan.fileName, url: await signR2Url(url) ?? url, createdAt: scan.createdAt.toISOString() }
    }
  };
  }
}

/** Borra una página escaneada (una equivocada), antes de armar el PDF. */
export async function DELETE(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (!canUseChecklist(session)) return NextResponse.json({ error: "No tienes permiso." }, { status: 403 });

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  // Solo de la propia tienda (no se borra el escaneo de otra).
  const scan = await prisma.checklistScan.findFirst({ where: { id, storeId: session.storeId } });
  if (!scan) return NextResponse.json({ error: "Escaneo no encontrado." }, { status: 404 });

  await prisma.checklistScan.delete({ where: { id: scan.id } });
  await deleteFromR2(scan.url).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
