import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, isApiError, parseJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createZendeskTicket, ZENDESK_ENABLED } from "@/lib/zendesk";

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

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, email: true, employeeNumber: true, role: true, store: { select: { name: true } } }
  });
  if (!user) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

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
    tags: ["clarvex-app", `store-${session.storeId}`, category ?? "general", user.role.toLowerCase()]
  });

  if (!result.ok) {
    return NextResponse.json({ error: "No se pudo enviar tu mensaje. Intenta de nuevo en un momento." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
