import { NextResponse } from "next/server";
import { expectedEntry } from "@/lib/attendance-sync";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { FORMS_AXO, leerCodigoForms } from "@/lib/forms-axo";
import { ordenDelForms } from "@/lib/marcaje-forms";
import { prisma } from "@/lib/prisma";
import { getFromR2, keyFromR2Url } from "@/lib/r2";
import { PERSON_WHERE } from "@/lib/store-people";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lo que necesita el script «Llenar desde Clarvex» para el Forms de AXO de HOY:
 * tienda y supervisor como vienen en sus listas, y por cada lugar del Forms
 * (gerente, subgerente, asesor 1…) el nombre, la hora y la foto del marcaje.
 *
 * Sin sesión a propósito: lo pide un script que corre en el Forms, en otro
 * sitio. Se autoriza con el código personal de `lib/forms-axo.ts` y solo para
 * gerencia activa de la tienda del código. Solo LEE.
 *
 * Las fotos van en base64 dentro del JSON: el script corre en Firefox del
 * celular y así no necesita permiso para otro dominio más (el de R2).
 */
export async function GET(request: Request) {
  const codigo = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const datos = codigo ? await leerCodigoForms(codigo) : null;
  if (!datos) return NextResponse.json({ error: "Código inválido o vencido. Pídele al bot uno nuevo: «código forms»." }, { status: 401 });

  const usuario = await prisma.user.findFirst({
    where: { id: datos.userId, storeId: datos.storeId, active: true, isDemo: false, role: { in: ["GERENTE", "SUBGERENTE"] } },
    select: { sessionVersion: true }
  });
  if (!usuario || usuario.sessionVersion !== datos.sv) {
    return NextResponse.json({ error: "Este código ya no es válido. Pídele al bot uno nuevo: «código forms»." }, { status: 401 });
  }
  const forms = FORMS_AXO[datos.storeId];
  if (!forms) return NextResponse.json({ error: "Tu tienda no tiene configurado el Forms de AXO." }, { status: 404 });

  const hoy = resolveMonterreyDate();
  const [turnos, marcajes, asistencias] = await Promise.all([
    prisma.schedule.findMany({
      where: { storeId: datos.storeId, date: hoy.utcDate, status: { in: ["WORKING", "INVENTORY"] }, user: PERSON_WHERE },
      select: { startTime: true, user: { select: { id: true, name: true, role: true } } }
    }),
    prisma.marcajeFoto.findMany({
      where: { storeId: datos.storeId, date: hoy.utcDate, accion: "ENTRADA" },
      select: { userId: true, hora: true, url: true, mimeType: true }
    }),
    // Sin foto, la hora sale de la asistencia capturada (Retool o el pase de lista).
    prisma.attendance.findMany({ where: { storeId: datos.storeId, date: hoy.utcDate }, select: { userId: true, arrivedAt: true } })
  ]);
  const llegada = new Map(asistencias.map((a) => [a.userId, a.arrivedAt]));
  const nombreCompleto = new Map(turnos.map((t) => [t.user.id, t.user.name]));
  const lugares = ordenDelForms(
    turnos.map((t) => ({ userId: t.user.id, name: t.user.name, role: t.user.role, expectedAt: expectedEntry(t.startTime) })),
    marcajes
  );

  const salida = [];
  for (const l of lugares) {
    let foto: { base64: string; mimeType: string } | null = null;
    const key = l.foto ? keyFromR2Url(l.foto.url) ?? l.foto.url : null;
    if (key) {
      const archivo = await getFromR2(key);
      if (archivo) foto = { base64: Buffer.from(archivo.body).toString("base64"), mimeType: l.foto!.mimeType };
    }
    salida.push({
      etiqueta: l.etiqueta,
      nombre: nombreCompleto.get(l.userId) ?? l.nombre,
      hora: l.foto?.hora ?? llegada.get(l.userId) ?? null,
      foto
    });
  }

  return NextResponse.json(
    { fecha: hoy.dateKey, tienda: forms.tienda, supervisor: forms.supervisor, lugares: salida },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
