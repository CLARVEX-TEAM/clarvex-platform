import { NextResponse } from "next/server";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { isApiError, requireSession } from "@/lib/api";
import {
  buildPowerBiAuthorizeUrl,
  createPowerBiOAuthState
} from "@/lib/integrations/power-bi-auth";
import { isPowerBiOAuthConfigured, requirePowerBiOAuthConfig } from "@/lib/integrations/power-bi-config";
import { PowerBiExportError } from "@/lib/integrations/power-bi-errors";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;

  if (!isPowerBiOAuthConfigured()) {
    return NextResponse.json(
      { error: "Power BI OAuth no está configurado en el servidor." },
      { status: 503 }
    );
  }

  try {
    requirePowerBiOAuthConfig();
    const state = await createPowerBiOAuthState(session.storeId, session.userId);
    const url = buildPowerBiAuthorizeUrl(state);
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof PowerBiExportError
      ? error.message
      : "No se pudo iniciar la conexión con Microsoft.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
