/**
 * Genera URLs de un solo uso para incrustar la app de captura de Retool dentro
 * de Clarvex, como "usuario externo".
 *
 * Por qué esta vía y no cuentas de Retool: una cuenta por gerente significa una
 * contraseña más que recordar para una tarea DIARIA —donde hoy bastan cuatro
 * dígitos— y un asiento facturable por cabeza. Como usuario externo no hay
 * cuenta, no hay contraseña y, hasta 50 personas, no hay coste.
 *
 * ⚠️ La identidad la pone SIEMPRE el servidor a partir de la sesión de Clarvex.
 * Ni el `storeId` ni el rol viajan desde el navegador: si lo hicieran, cualquiera
 * podría pedir una URL para la tienda de al lado y escribir sus horarios.
 */

export type RetoolEmbedUser = {
  /** Id del usuario en Clarvex. Es el identificador estable frente a Retool. */
  id: string;
  name: string;
  email: string;
  storeId: string;
  storeName: string;
  role: string;
};

export type EmbedUrlOutcome =
  | { ok: true; url: string }
  | { ok: false; error: string; status: number };

const REQUIRED_VARS = ["RETOOL_API_TOKEN", "RETOOL_ORG_URL", "RETOOL_APP_UUID", "RETOOL_EMBED_GROUP_ID"] as const;

/** Qué falta por configurar. Vacío = listo para pedir URLs. */
export function missingRetoolEmbedConfig(): string[] {
  return REQUIRED_VARS.filter((name) => !process.env[name]?.trim());
}

export async function createEmbedUrl(user: RetoolEmbedUser, fetchImpl: typeof fetch = fetch): Promise<EmbedUrlOutcome> {
  const missing = missingRetoolEmbedConfig();
  if (missing.length > 0) {
    // Fail-closed y explícito: un 500 genérico aquí obligaría a adivinar cuál de
    // las cuatro variables falta, y esa ambigüedad ya costó cara en este proyecto.
    return { ok: false, status: 503, error: `Falta configurar: ${missing.join(", ")}.` };
  }

  const orgUrl = process.env.RETOOL_ORG_URL!.trim().replace(/\/+$/, "");
  const groupId = Number(process.env.RETOOL_EMBED_GROUP_ID!.trim());
  if (!Number.isInteger(groupId)) {
    return { ok: false, status: 503, error: "RETOOL_EMBED_GROUP_ID debe ser un número entero." };
  }

  const [firstName, ...rest] = user.name.trim().split(/\s+/);

  let response: Response;
  try {
    response = await fetchImpl(`${orgUrl}/api/embed-url/external-user`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RETOOL_API_TOKEN!.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        landingPageUuid: process.env.RETOOL_APP_UUID!.trim(),
        groupIds: [groupId],
        externalIdentifier: user.id,
        userInfo: {
          firstName: firstName || user.name,
          lastName: rest.join(" "),
          email: user.email
        },
        // Lo que la app de Retool leerá en `__user.metadata` para acotar la
        // captura a una sola tienda. Sale de la sesión, nunca del cliente.
        metadata: {
          storeId: user.storeId,
          storeName: user.storeName,
          role: user.role
        }
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { ok: false, status: 502, error: `No se pudo contactar con Retool: ${message}` };
  }

  const payload = (await response.json().catch(() => null)) as { embedUrl?: string; message?: string } | null;
  if (!response.ok) {
    return { ok: false, status: 502, error: payload?.message ?? `Retool respondió ${response.status}.` };
  }
  if (!payload?.embedUrl) {
    return { ok: false, status: 502, error: "Retool no devolvió una URL de incrustación." };
  }
  return { ok: true, url: payload.embedUrl };
}
