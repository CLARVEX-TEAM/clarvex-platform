import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, isApiError, parseJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createZendeskTicket, ZENDESK_ENABLED } from "@/lib/zendesk";
import { claveDeLaPeticion, conIdempotencia } from "@/lib/idempotencia-db";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  problema: "Problema",
  duda: "Duda",
  solicitud: "Solicitud"
};

const schema = z.object({
  subject: z.string().trim().min(3, "El asunto es muy corto.").max(150),
  message: z.string().trim().min(10, "Cuéntanos un poco más.").max(4000),
  category: z.enum(["problema", "duda", "solicitud"]).optional(),
  // Pantalla desde donde escribe (para dar contexto al soporte).
  fromUrl: z.string().max(300).optional()
});

// POST — crea un ticket de soporte en Zendesk con la identidad del usuario.
export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  if (!ZENDESK_ENABLED) {
    return NextResponse.json({ error: "El soporte no está configurado todavía. Avisa al administrador." }, { status: 503 });
  }

  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;
  const { subject, message, category, fromUrl } = parsed.data;

  /*
   * ⚠️ **Desde aquí dentro de la guarda de idempotencia.** Crear un ticket en
   * Zendesk NO es inofensivo de repetir: un reintento abre un SEGUNDO ticket y
   * soporte atiende dos veces la misma cosa. Y reintentar es justo lo que hace
   * la cola cuando esto se captura sin señal.
   *
   * Sin cabecera `Idempotency-Key` todo se comporta igual que antes.
   */
  const sesion = session;
  const datos = parsed.data;
  const resultado = await conIdempotencia(
    {
      clave: claveDeLaPeticion(request),
      storeId: session.storeId,
      userId: session.userId,
      route: "/api/support",
      cuerpo: { subject, message, category: category ?? null }
    },
    async () => abrirTicket()
  );
  return NextResponse.json(resultado.body, { status: resultado.status });

  async function abrirTicket(): Promise<{ status: number; body: unknown }> {
  const user = await prisma.user.findUnique({
    where: { id: sesion.userId },
    select: { name: true, email: true, employeeNumber: true, role: true, store: { select: { name: true } } }
  });
  if (!user) return { status: 401, body: { error: "Sesión no válida." } };

  const storeName = user.store?.name ?? "—";
  const catLabel = category ? CATEGORY_LABEL[category] : null;

  // La identidad va SIEMPRE en el cuerpo (aunque el email sea placeholder), para
  // que soporte sepa quién y de qué tienda reporta.
  const body = [
    message,
    "",
    "———",
    "Enviado desde Clarvex Team",
    `Usuario: ${user.name} (#${user.employeeNumber}) · ${user.role}`,
    `Tienda: ${storeName}`,
    `Correo: ${user.email}`,
    fromUrl ? `Pantalla: ${fromUrl}` : null
  ].filter(Boolean).join("\n");

  const result = await createZendeskTicket({
    subject: catLabel ? `[${catLabel}] ${subject}` : subject,
    body,
    requesterName: user.name,
    requesterEmail: user.email,
    tags: ["clarvex-app", `store-${sesion.storeId}`, datos.category ?? "general", user.role.toLowerCase()]
  });

  if (!result.ok) {
    return { status: 502, body: { error: "No se pudo enviar tu mensaje. Intenta de nuevo en un momento." } };
  }
  return { status: 200, body: { ok: true, id: result.id } };
  }
}
