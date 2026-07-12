import { NextResponse } from "next/server";
import { z } from "zod";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { isApiError, requireSession } from "@/lib/api";
import {
  getPowerBiAccessTokenForStore,
  getPowerBiConnectionStatus,
  savePowerBiDevToolsConnection
} from "@/lib/integrations/power-bi-auth";
import { exportPowerBI } from "@/lib/integrations/power-bi-export";
import { PowerBiExportError } from "@/lib/integrations/power-bi-errors";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fetchSource: z.string().trim().min(20).max(500_000)
});

export async function POST(request: Request) {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;

  let body: z.infer<typeof bodySchema>;
  try {
    const json = await request.json() as unknown;
    body = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Pega el fetch completo copiado desde DevTools." }, { status: 400 });
  }

  try {
    await savePowerBiDevToolsConnection({
      storeId: session.storeId,
      connectedByUserId: session.userId,
      fetchSource: body.fetchSource
    });

    const connection = await prisma.storePowerBiConnection.findUnique({
      where: { storeId: session.storeId }
    });
    if (!connection) {
      return NextResponse.json({ error: "No se pudo guardar la conexión de DevTools." }, { status: 500 });
    }

    const accessToken = await getPowerBiAccessTokenForStore(session.storeId);
    const payload = connection.exportPayloadTemplate as Record<string, unknown>;
    const buffer = await exportPowerBI(accessToken, payload, connection.exportUrl);
    const status = await getPowerBiConnectionStatus(session.storeId);

    return NextResponse.json({
      ok: true,
      message: `Token guardado y probado. Excel recibido (${buffer.length.toLocaleString("es-MX")} bytes).`,
      bytes: buffer.length,
      status
    });
  } catch (error) {
    const message = error instanceof PowerBiExportError
      ? error.message
      : error instanceof Error
        ? error.message
        : "No se pudo guardar el token de DevTools.";
    const status = error instanceof PowerBiExportError && error.code === "POWER_BI_TOKEN_EXPIRED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
