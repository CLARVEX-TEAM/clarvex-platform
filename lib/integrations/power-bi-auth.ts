import { createHash } from "node:crypto";
import {
  DEFAULT_POWER_BI_EXPORT_PAYLOAD,
  DEFAULT_POWER_BI_EXPORT_URL,
  isPowerBiOAuthConfigured
} from "@/lib/integrations/power-bi-config";
import { PowerBiExportError } from "@/lib/integrations/power-bi-errors";
import {
  buildPowerBiAuthorizeUrl,
  createPowerBiOAuthState,
  exchangePowerBiAuthCode,
  refreshPowerBiAccessToken,
  verifyPowerBiOAuthState
} from "@/lib/integrations/power-bi-oauth-client";
import { decryptPowerBiSecret, encryptPowerBiSecret } from "@/lib/integrations/power-bi-token-crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export {
  buildPowerBiAuthorizeUrl,
  createPowerBiOAuthState,
  exchangePowerBiAuthCode,
  refreshPowerBiAccessToken,
  verifyPowerBiOAuthState
} from "@/lib/integrations/power-bi-oauth-client";

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
      encryptedRefreshToken,
      msAccountEmail: input.accountEmail,
      connectedByUserId: input.connectedByUserId,
      exportUrl: input.exportUrl ?? DEFAULT_POWER_BI_EXPORT_URL,
      exportPayloadTemplate: payloadTemplate
    },
    create: {
      storeId: input.storeId,
      encryptedRefreshToken,
      msAccountEmail: input.accountEmail,
      connectedByUserId: input.connectedByUserId,
      exportUrl: input.exportUrl ?? DEFAULT_POWER_BI_EXPORT_URL,
      exportPayloadTemplate: payloadTemplate
    }
  });
}

export async function deletePowerBiConnection(storeId: string) {
  await prisma.storePowerBiConnection.deleteMany({ where: { storeId } });
}

export async function getPowerBiConnectionStatus(storeId: string) {
  const connection = await prisma.storePowerBiConnection.findUnique({ where: { storeId } });
  if (!connection) {
    return {
      configuredOnServer: isPowerBiOAuthConfigured(),
      connected: false,
      accountEmail: null as string | null,
      connectedAt: null as string | null,
      exportUrl: DEFAULT_POWER_BI_EXPORT_URL
    };
  }

  return {
    configuredOnServer: isPowerBiOAuthConfigured(),
    connected: true,
    accountEmail: connection.msAccountEmail,
    connectedAt: connection.connectedAt.toISOString(),
    exportUrl: connection.exportUrl
  };
}

export async function getPowerBiAccessTokenForStore(storeId: string): Promise<string> {
  const connection = await prisma.storePowerBiConnection.findUnique({ where: { storeId } });
  if (!connection) {
    throw new PowerBiExportError("Power BI no está conectado para esta tienda.", {
      code: "POWER_BI_NOT_CONNECTED"
    });
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
