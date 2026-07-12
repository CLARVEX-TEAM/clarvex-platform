import { NextResponse } from "next/server";
import {
  exchangePowerBiAuthCode,
  savePowerBiConnection,
  verifyPowerBiOAuthState
} from "@/lib/integrations/power-bi-auth";
import { PowerBiExportError } from "@/lib/integrations/power-bi-errors";

export const dynamic = "force-dynamic";

const SUCCESS_REDIRECT = "/datos?powerbi=connected";
const ERROR_REDIRECT = "/datos?powerbi=error";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(new URL(`${ERROR_REDIRECT}&reason=${encodeURIComponent(oauthError)}`, url.origin));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL(`${ERROR_REDIRECT}&reason=missing_code`, url.origin));
  }

  try {
    const { storeId, userId } = await verifyPowerBiOAuthState(state);
    const tokens = await exchangePowerBiAuthCode(code);
    await savePowerBiConnection({
      storeId,
      connectedByUserId: userId,
      refreshToken: tokens.refreshToken,
      accountEmail: tokens.accountEmail
    });
    return NextResponse.redirect(new URL(SUCCESS_REDIRECT, url.origin));
  } catch (error) {
    const reason = error instanceof PowerBiExportError ? error.message : "oauth_failed";
    return NextResponse.redirect(new URL(`${ERROR_REDIRECT}&reason=${encodeURIComponent(reason)}`, url.origin));
  }
}
