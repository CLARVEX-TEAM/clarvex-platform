import { NextResponse } from "next/server";
import { z } from "zod";
import { denyDemo, isApiError, parseJson, requireSession } from "@/lib/api";
import {
  loadElectronicTicketCapture,
  saveElectronicTicketCapture
} from "@/lib/electronic-ticket-capture-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const saveSchema = z.object({
  weekNumber: z.number().int().min(1).max(53),
  entries: z
    .array(
      z.object({
        userId: z.string().min(1),
        crmTransactions: z.number().int().min(0).max(100000).nullable(),
        posTransactions: z.number().int().min(0).max(100000).nullable()
      })
    )
    .max(100)
});

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (session.role === "ASESOR") {
    return NextResponse.json({ error: "No tienes permiso." }, { status: 403 });
  }

  return NextResponse.json(await loadElectronicTicketCapture(session.storeId));
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (session.role === "ASESOR") {
    return NextResponse.json({ error: "No tienes permiso." }, { status: 403 });
  }
  const demo = denyDemo(session);
  if (demo) return demo;

  const parsed = await parseJson(request, saveSchema);
  if ("response" in parsed) return parsed.response;

  const result = await saveElectronicTicketCapture(session.storeId, parsed.data.weekNumber, parsed.data.entries);
  if (result.rejected.length > 0) {
    return NextResponse.json(
      {
        error: `No se guardó: ${result.rejected.map((entry) => `${entry.name} ${entry.reason}`).join("; ")}.`,
        saved: result.saved
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ saved: result.saved });
}
