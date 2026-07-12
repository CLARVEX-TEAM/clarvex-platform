import { NextResponse } from "next/server";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { isApiError, requireSession } from "@/lib/api";
import { getPowerBiAccessTokenForStore } from "@/lib/integrations/power-bi-auth";
import { exportPowerBI } from "@/lib/integrations/power-bi-export";
import { PowerBiExportError } from "@/lib/integrations/power-bi-errors";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;

  try {
    const connection = await prisma.storePowerBiConnection.findUnique({
      where: { storeId: session.storeId }
    });
    if (!connection) {
      return NextResponse.json({ error: "Power BI no está conectado." }, { status: 400 });
    }

    const accessToken = await getPowerBiAccessTokenForStore(session.storeId);
    const payload = connection.exportPayloadTemplate as Record<string, unknown>;
    const buffer = await exportPowerBI(accessToken, payload, connection.exportUrl);

    return NextResponse.json({
      ok: true,
      message: `Conexión correcta. Excel recibido (${buffer.length.toLocaleString("es-MX")} bytes).`,
      bytes: buffer.length
    });
  } catch (error) {
    const message = error instanceof PowerBiExportError
      ? error.message
      : "No se pudo probar la exportación de Power BI.";
    const status = error instanceof PowerBiExportError && error.code === "POWER_BI_TOKEN_EXPIRED" ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
