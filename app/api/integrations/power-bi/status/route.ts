import { NextResponse } from "next/server";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { isApiError, requireSession } from "@/lib/api";
import { getPowerBiConnectionStatus } from "@/lib/integrations/power-bi-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;

  const status = await getPowerBiConnectionStatus(session.storeId);
  return NextResponse.json({ status });
}
