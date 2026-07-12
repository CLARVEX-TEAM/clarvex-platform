import { PowerBiExportError } from "@/lib/integrations/power-bi-errors";
import defaultExportPayload from "@/lib/integrations/power-bi-default-export.json";

export const DEFAULT_POWER_BI_EXPORT_URL =
  "https://wabi-south-central-us-redirect.analysis.windows.net/export/xlsx";

export const DEFAULT_POWER_BI_EXPORT_PAYLOAD = defaultExportPayload as Record<string, unknown>;

export type PowerBiOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getPowerBiOAuthConfig(): PowerBiOAuthConfig | null {
  const clientId = process.env.POWER_BI_CLIENT_ID?.trim();
  const clientSecret = process.env.POWER_BI_CLIENT_SECRET?.trim();
  const redirectUri = process.env.POWER_BI_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function requirePowerBiOAuthConfig(): PowerBiOAuthConfig {
  const config = getPowerBiOAuthConfig();
  if (!config) {
    throw new PowerBiExportError(
      "OAuth de Power BI no está configurado en el servidor (POWER_BI_CLIENT_ID, POWER_BI_CLIENT_SECRET, POWER_BI_REDIRECT_URI).",
      { code: "POWER_BI_NOT_CONFIGURED" }
    );
  }
  return config;
}

export function isPowerBiOAuthConfigured(): boolean {
  return (
    getPowerBiOAuthConfig() !== null && Boolean(process.env.POWER_BI_TOKEN_ENCRYPTION_KEY?.trim())
  );
}
