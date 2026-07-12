import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { requirePowerBiOAuthConfig, type PowerBiOAuthConfig } from "@/lib/integrations/power-bi-config";
import { PowerBiExportError, PowerBiTokenExpiredError } from "@/lib/integrations/power-bi-errors";

const AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const POWER_BI_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "https://analysis.windows.net/powerbi/api/Report.Read.All",
  "https://analysis.windows.net/powerbi/api/Dataset.Read.All"
].join(" ");

export type OAuthStatePayload = {
  storeId: string;
  userId: string;
  nonce: string;
};

type MicrosoftTokenResponse = {
  token_type?: string;
  scope?: string;
  expires_in?: number;
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

function authSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new PowerBiExportError("AUTH_SECRET no está configurado para firmar el estado OAuth.");
  }
  return new TextEncoder().encode(secret);
}

export async function createPowerBiOAuthState(storeId: string, userId: string): Promise<string> {
  return new SignJWT({
    storeId,
    userId,
    nonce: randomBytes(16).toString("hex")
  } satisfies OAuthStatePayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(authSecret());
}

export async function verifyPowerBiOAuthState(state: string): Promise<OAuthStatePayload> {
  const { payload } = await jwtVerify(state, authSecret());
  const storeId = typeof payload.storeId === "string" ? payload.storeId : "";
  const userId = typeof payload.userId === "string" ? payload.userId : "";
  const nonce = typeof payload.nonce === "string" ? payload.nonce : "";
  if (!storeId || !userId || !nonce) {
    throw new PowerBiExportError("Estado OAuth de Power BI inválido o expirado.");
  }
  return { storeId, userId, nonce };
}

export function buildPowerBiAuthorizeUrl(state: string, config: PowerBiOAuthConfig = requirePowerBiOAuthConfig()): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    response_mode: "query",
    scope: POWER_BI_SCOPES,
    state,
    prompt: "select_account"
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function requestMicrosoftToken(body: URLSearchParams): Promise<MicrosoftTokenResponse> {
  const config = requirePowerBiOAuthConfig();
  body.set("client_id", config.clientId);
  body.set("client_secret", config.clientSecret);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  const json = (await response.json().catch(() => ({}))) as MicrosoftTokenResponse;
  if (!response.ok || json.error) {
    const detail = json.error_description ?? json.error ?? `HTTP ${response.status}`;
    if (/invalid_grant|expired|revoked/i.test(detail)) {
      throw new PowerBiTokenExpiredError(
        "La conexión con Microsoft expiró o fue revocada. Vuelve a conectar Power BI en Centro de Datos."
      );
    }
    throw new PowerBiExportError(`Microsoft no devolvió tokens: ${detail}`);
  }
  return json;
}

function readIdTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      preferred_username?: string;
      upn?: string;
      email?: string;
    };
    return payload.preferred_username ?? payload.upn ?? payload.email ?? null;
  } catch {
    return null;
  }
}

export async function exchangePowerBiAuthCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  accountEmail: string | null;
}> {
  const config = requirePowerBiOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    scope: POWER_BI_SCOPES
  });
  const tokens = await requestMicrosoftToken(body);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new PowerBiExportError("Microsoft no devolvió refresh token. Intenta conectar de nuevo.");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accountEmail: readIdTokenEmail(tokens.id_token)
  };
}

export async function refreshPowerBiAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: POWER_BI_SCOPES
  });
  const tokens = await requestMicrosoftToken(body);
  if (!tokens.access_token) {
    throw new PowerBiTokenExpiredError();
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? refreshToken
  };
}
