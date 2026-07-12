import { createHash } from "node:crypto";
import {
  DEFAULT_POWER_BI_EXPORT_PAYLOAD,
  DEFAULT_POWER_BI_EXPORT_URL,
  isPowerBiOAuthConfigured,
  isPowerBiTokenStorageConfigured
} from "@/lib/integrations/power-bi-config";
import { PowerBiExportError, PowerBiTokenExpiredError } from "@/lib/integrations/power-bi-errors";
import {
  decodeJwtAccountEmail,
  decodeJwtExpiresAt,
  parseDevToolsConnection
} from "@/lib/integrations/power-bi-fetch-parser";
import {
  buildPowerBiAuthorizeUrl,
  createPowerBiOAuthState,
  exchangePowerBiAuthCode,
  refreshPowerBiAccessToken,
  verifyPowerBiOAuthState
} from "@/lib/integrations/power-bi-oauth-client";
import { decryptPowerBiSecret, encryptPowerBiSecret } from "@/lib/integrations/power-bi-token-crypto";
import { prisma } from "@/lib/prisma";
import type { PowerBiAuthMode, Prisma } from "@prisma/client";

export {
  buildPowerBiAuthorizeUrl,
  createPowerBiOAuthState,
  exchangePowerBiAuthCode,
  refreshPowerBiAccessToken,
  verifyPowerBiOAuthState
} from "@/lib/integrations/power-bi-oauth-client";

export type PowerBiConnectionStatus = {
  configuredOnServer: boolean;
  devToolsAvailable: boolean;
  connected: boolean;
  authMode: PowerBiAuthMode | null;
  accountEmail: string | null;
  connectedAt: string | null;
  exportUrl: string;
  accessTokenExpiresAt: string | null;
  accessTokenExpired: boolean;
};

function isAccessTokenExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= Date.now();
}

export async function savePowerBiConnection(input: {
  storeId: string;
  connectedByUserId: string;
  refreshToken: string;
  accountEmail: string | null;
  exportUrl?: string;
  exportPayloadTemplate?: Record<string, unknown>;
}) {
  const encryptedRefreshToken = encryptPowerBiSecret(input.refreshToken);
  const payloadTemplate = (input.exportPayloadTemplate ?? DEFAULT_POWER_BI_EXPORT_PAYLOAD) as Prisma.InputJsonValue;
  return prisma.storePowerBiConnection.upsert({
    where: { storeId: input.storeId },
    update: {
      authMode: "OAUTH",
      encryptedRefreshToken,
      encryptedAccessToken: null,
      accessTokenExpiresAt: null,
      msAccountEmail: input.accountEmail,
      connectedByUserId: input.connectedByUserId,
      exportUrl: input.exportUrl ?? DEFAULT_POWER_BI_EXPORT_URL,
      exportPayloadTemplate: payloadTemplate
    },
    create: {
      storeId: input.storeId,
      authMode: "OAUTH",
      encryptedRefreshToken,
      msAccountEmail: input.accountEmail,
      connectedByUserId: input.connectedByUserId,
      exportUrl: input.exportUrl ?? DEFAULT_POWER_BI_EXPORT_URL,
      exportPayloadTemplate: payloadTemplate
    }
  });
}

export async function savePowerBiDevToolsConnection(input: {
  storeId: string;
  connectedByUserId: string;
  fetchSource: string;
}) {
  if (!isPowerBiTokenStorageConfigured()) {
    throw new PowerBiExportError(
      "POWER_BI_TOKEN_ENCRYPTION_KEY no está configurada en el servidor.",
      { code: "POWER_BI_CRYPTO_NOT_CONFIGURED" }
    );
  }

  const parsed = parseDevToolsConnection(input.fetchSource);
  const encryptedAccessToken = encryptPowerBiSecret(parsed.bearerToken);
  const accessTokenExpiresAt = decodeJwtExpiresAt(parsed.bearerToken);
  const accountEmail = decodeJwtAccountEmail(parsed.bearerToken);
  const payloadTemplate = parsed.exportPayloadTemplate as Prisma.InputJsonValue;

  return prisma.storePowerBiConnection.upsert({
    where: { storeId: input.storeId },
    update: {
      authMode: "DEVTOOLS",
      encryptedRefreshToken: null,
      encryptedAccessToken,
      accessTokenExpiresAt,
      msAccountEmail: accountEmail,
      connectedByUserId: input.connectedByUserId,
      exportUrl: parsed.exportUrl,
      exportPayloadTemplate: payloadTemplate
    },
    create: {
      storeId: input.storeId,
      authMode: "DEVTOOLS",
      encryptedAccessToken,
      accessTokenExpiresAt,
      msAccountEmail: accountEmail,
      connectedByUserId: input.connectedByUserId,
      exportUrl: parsed.exportUrl,
      exportPayloadTemplate: payloadTemplate
    }
  });
}

export async function deletePowerBiConnection(storeId: string) {
  await prisma.storePowerBiConnection.deleteMany({ where: { storeId } });
}

export async function getPowerBiConnectionStatus(storeId: string): Promise<PowerBiConnectionStatus> {
  const connection = await prisma.storePowerBiConnection.findUnique({ where: { storeId } });
  if (!connection) {
    return {
      configuredOnServer: isPowerBiOAuthConfigured(),
      devToolsAvailable: isPowerBiTokenStorageConfigured(),
      connected: false,
      authMode: null,
      accountEmail: null,
      connectedAt: null,
      exportUrl: DEFAULT_POWER_BI_EXPORT_URL,
      accessTokenExpiresAt: null,
      accessTokenExpired: false
    };
  }

  const accessTokenExpired =
    connection.authMode === "DEVTOOLS" && isAccessTokenExpired(connection.accessTokenExpiresAt);

  return {
    configuredOnServer: isPowerBiOAuthConfigured(),
    devToolsAvailable: isPowerBiTokenStorageConfigured(),
    connected: true,
    authMode: connection.authMode,
    accountEmail: connection.msAccountEmail,
    connectedAt: connection.connectedAt.toISOString(),
    exportUrl: connection.exportUrl,
    accessTokenExpiresAt: connection.accessTokenExpiresAt?.toISOString() ?? null,
    accessTokenExpired
  };
}

export async function getPowerBiAccessTokenForStore(storeId: string): Promise<string> {
  const connection = await prisma.storePowerBiConnection.findUnique({ where: { storeId } });
  if (!connection) {
    throw new PowerBiExportError("Power BI no está conectado para esta tienda.", {
      code: "POWER_BI_NOT_CONNECTED"
    });
  }

  if (connection.authMode === "DEVTOOLS") {
    if (!connection.encryptedAccessToken) {
      throw new PowerBiExportError("Token de DevTools no guardado.", { code: "POWER_BI_NOT_CONNECTED" });
    }
    if (isAccessTokenExpired(connection.accessTokenExpiresAt)) {
      throw new PowerBiTokenExpiredError(
        "El token de DevTools expiró. Exporta de nuevo en Power BI, copia el fetch y pégalo en Centro de Datos."
      );
    }
    return decryptPowerBiSecret(connection.encryptedAccessToken);
  }

  if (!connection.encryptedRefreshToken) {
    throw new PowerBiExportError("Conexión OAuth incompleta.", { code: "POWER_BI_NOT_CONNECTED" });
  }

  const refreshToken = decryptPowerBiSecret(connection.encryptedRefreshToken);
  const tokens = await refreshPowerBiAccessToken(refreshToken);

  if (tokens.refreshToken !== refreshToken) {
    await prisma.storePowerBiConnection.update({
      where: { storeId },
      data: { encryptedRefreshToken: encryptPowerBiSecret(tokens.refreshToken) }
    });
  }

  return tokens.accessToken;
}

export function fingerprintAccountEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 12);
}
