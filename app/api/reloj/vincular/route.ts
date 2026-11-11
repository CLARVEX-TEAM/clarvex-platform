import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimitAuth } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { crearTokenReloj, generarCodigo, huella, VIGENCIA_CODIGO_MS } from "@/lib/reloj";

export const dynamic = "force-dynamic";

/**
 * Vinculación del Pixel Watch (ver `lib/reloj.ts`). Sin sesión: quien llama es
 * el reloj, que todavía no tiene nada.
 *
 *   POST { secreto }   → { codigo }   el reloj lo enseña en pantalla
 *   GET  ?secreto=…    → { pendiente } hasta que gerencia lo aprueba por el bot,
 *                        y entonces { token }, UNA sola vez.
 */

const secreto = z.string().min(32).max(200).regex(/^[A-Za-z0-9_-]+$/);

export async function POST(request: Request) {
  const limite = await rateLimitAuth(clientIp(request.headers));
  if (!limite.allowed) return NextResponse.json({ error: "Demasiados intentos." }, { status: 429 });

  const cuerpo = z.object({ secreto }).safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: "Falta el secreto del reloj." }, { status: 400 });

  // Limpieza de los que caducaron sin aprobarse.
  await prisma.relojVinculo.deleteMany({ where: { expiraAt: { lt: new Date() } } }).catch(() => undefined);

  const hash = huella(cuerpo.data.secreto);
  for (let intento = 0; intento < 5; intento++) {
    try {
      const fila = await prisma.relojVinculo.upsert({
        where: { secretoHash: hash },
        create: { codigo: generarCodigo(), secretoHash: hash, expiraAt: new Date(Date.now() + VIGENCIA_CODIGO_MS) },
        update: { expiraAt: new Date(Date.now() + VIGENCIA_CODIGO_MS) },
        select: { codigo: true, expiraAt: true }
      });
      return NextResponse.json({ codigo: fila.codigo, expiraAt: fila.expiraAt.toISOString() });
    } catch {
      // Choque de código (1 en ~900 millones): se intenta con otro.
    }
  }
  return NextResponse.json({ error: "No se pudo generar el código." }, { status: 500 });
}

export async function GET(request: Request) {
  const s = secreto.safeParse(new URL(request.url).searchParams.get("secreto"));
  if (!s.success) return NextResponse.json({ error: "Falta el secreto del reloj." }, { status: 400 });

  const fila = await prisma.relojVinculo.findUnique({ where: { secretoHash: huella(s.data) } });
  if (!fila || fila.expiraAt < new Date()) return NextResponse.json({ error: "El código venció. Pide otro en el reloj." }, { status: 410 });
  if (!fila.aprobadoAt || !fila.userId) return NextResponse.json({ pendiente: true, codigo: fila.codigo });

  const usuario = await prisma.user.findUnique({ where: { id: fila.userId }, select: { id: true, storeId: true, sessionVersion: true } });
  // Se entrega UNA vez: el registro desaparece con la entrega.
  await prisma.relojVinculo.delete({ where: { id: fila.id } });
  if (!usuario) return NextResponse.json({ error: "La cuenta ya no existe." }, { status: 410 });
  const token = await crearTokenReloj(usuario);
  return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store, private" } });
}
