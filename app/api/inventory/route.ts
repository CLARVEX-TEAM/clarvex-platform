import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { isInventoryCategory, INVENTORY_CATEGORY_LABELS } from "@/lib/inventory";
import { validateEvidenceImage } from "@/lib/evidence";
import { createNotifications } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { firstName } from "@/lib/daily-summary";
import { prisma } from "@/lib/prisma";
import { deleteFromR2, uploadToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReportWithUsers = {
  id: string;
  productName: string;
  category: string;
  note: string | null;
  photoUrl: string | null;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
  reporter: { name: string; photoUrl: string | null };
  resolvedBy: { name: string } | null;
};

function serialize(report: ReportWithUsers) {
  return {
    id: report.id,
    productName: report.productName,
    category: report.category,
    note: report.note,
    photoUrl: report.photoUrl,
    status: report.status,
    createdAt: report.createdAt.toISOString(),
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    reporter: { name: report.reporter.name, photoUrl: report.reporter.photoUrl },
    resolvedBy: report.resolvedBy ? { name: report.resolvedBy.name } : null
  };
}

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const reports = await prisma.inventoryReport.findMany({
    where: { storeId: session.storeId },
    include: { reporter: { select: { name: true, photoUrl: true } }, resolvedBy: { select: { name: true } } },
    // Abiertos primero, luego por fecha (recientes arriba).
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });
  return NextResponse.json({ reports: reports.map(serialize) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const form = await request.formData().catch(() => null);
  const productName = form?.get("productName")?.toString().trim() ?? "";
  const category = form?.get("category")?.toString().trim() ?? "";
  const note = form?.get("note")?.toString().trim() ?? "";
  if (productName.length < 2 || productName.length > 120) return NextResponse.json({ error: "Indica el producto (2-120 caracteres)." }, { status: 400 });
  if (!isInventoryCategory(category)) return NextResponse.json({ error: "Categoría inválida." }, { status: 400 });
  if (note.length > 500) return NextResponse.json({ error: "La nota no puede superar 500 caracteres." }, { status: 400 });

  const rawFile = form?.get("photo");
  const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
  let photoUrl: string | null = null;
  if (file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateEvidenceImage(file, bytes);
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });
    try {
      const key = `inventory/${session.userId}-${Date.now()}-${crypto.randomUUID()}.${validation.extension}`;
      photoUrl = await uploadToR2(key, bytes, file.type);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo subir la foto." }, { status: 500 });
    }
  }

  try {
    const report = await prisma.inventoryReport.create({
      data: { storeId: session.storeId, reporterId: session.userId, productName, category, note: note || null, photoUrl },
      include: { reporter: { select: { name: true, photoUrl: true } }, resolvedBy: { select: { name: true } } }
    });

    const managers = await prisma.user.findMany({ where: { storeId: session.storeId, role: { in: ["GERENTE", "SUBGERENTE"] }, id: { not: session.userId } }, select: { id: true } });
    const managerIds = managers.map((manager) => manager.id);
    if (managerIds.length > 0) {
      const title = "Reporte de inventario";
      const body = `${firstName(session.name)} reportó ${INVENTORY_CATEGORY_LABELS[category] ?? category}: ${productName}`;
      await createNotifications(prisma, managerIds.map((id) => ({ storeId: session.storeId, userId: id, type: "INVENTORY_REPORT" as const, title, body })));
      dispatchPushToUsers(managerIds, { title, body, tag: "inventario" }).catch(() => undefined);
    }

    return NextResponse.json({ report: serialize(report) }, { status: 201 });
  } catch (error) {
    if (photoUrl) await deleteFromR2(photoUrl).catch(() => undefined);
    return NextResponse.json({ error: "No se pudo guardar el reporte." }, { status: 500 });
  }
}
