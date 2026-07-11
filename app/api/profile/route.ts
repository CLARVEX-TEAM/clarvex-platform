import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hashPin } from "@/lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const schema = z.object({
  userId: z.string().optional(), // gerencia puede configurar a otro integrante
  birthDate: z.string().regex(DATE_RE).nullable().optional(),
  hireDate: z.string().regex(DATE_RE).nullable().optional(),
  hoursOwed: z.number().min(-1000).max(1000).optional(), // solo gerencia
  vacationDays: z.number().min(-1000).max(1000).optional(), // solo gerencia
  paidDays: z.number().min(-1000).max(1000).optional(), // solo gerencia
  active: z.boolean().optional(), // solo gerencia, sobre otro integrante
  pin: z.string().regex(/^\d{4}$/, "El PIN debe tener 4 dígitos.").optional() // solo gerencia, reset PIN
});

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined; // sin cambio
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

function serialize(user: { birthDate: Date | null; hireDate: Date | null; hoursOwed: number; vacationDays: number; paidDays: number }) {
  return {
    birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
    hireDate: user.hireDate ? user.hireDate.toISOString().slice(0, 10) : null,
    hoursOwed: user.hoursOwed,
    vacationDays: user.vacationDays,
    paidDays: user.paidDays
  };
}

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { birthDate: true, hireDate: true, hoursOwed: true, vacationDays: true, paidDays: true } });
  return NextResponse.json(serialize(user ?? { birthDate: null, hireDate: null, hoursOwed: 0, vacationDays: 0, paidDays: 0 }));
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  // Por defecto edita el propio perfil. Gerencia puede configurar a otro integrante de su tienda.
  let targetUserId = session.userId;
  if (parsed.data.userId && parsed.data.userId !== session.userId) {
    if (session.role === "ASESOR") return NextResponse.json({ error: "No tienes permiso." }, { status: 403 });
    const target = await prisma.user.findFirst({ where: { id: parsed.data.userId, storeId: session.storeId }, select: { id: true } });
    if (!target) return NextResponse.json({ error: "Integrante no encontrado." }, { status: 404 });
    targetUserId = target.id;
  }

  const data: { birthDate?: Date | null; hireDate?: Date | null; hoursOwed?: number; vacationDays?: number; paidDays?: number; active?: boolean; pinHash?: string } = {};
  const birth = toDate(parsed.data.birthDate);
  const hire = toDate(parsed.data.hireDate);
  if (birth !== undefined) data.birthDate = birth;
  if (hire !== undefined) data.hireDate = hire;
  // Solo gerencia puede ajustar los saldos (horas, vacaciones y pago de días) y PIN.
  if (session.role !== "ASESOR") {
    if (parsed.data.hoursOwed !== undefined) data.hoursOwed = parsed.data.hoursOwed;
    if (parsed.data.vacationDays !== undefined) data.vacationDays = parsed.data.vacationDays;
    if (parsed.data.paidDays !== undefined) data.paidDays = parsed.data.paidDays;
    if (parsed.data.pin !== undefined) data.pinHash = await hashPin(parsed.data.pin);
    // Activar/desactivar cuenta: solo sobre otro integrante (nadie puede desactivarse a sí mismo).
    if (parsed.data.active !== undefined) {
      if (targetUserId === session.userId) return NextResponse.json({ error: "No puedes desactivar tu propia cuenta." }, { status: 400 });
      data.active = parsed.data.active;
    }
  }

  // Cambiar el PIN invalida las sesiones previas del usuario (sube sessionVersion).
  const pinChanged = data.pinHash !== undefined;
  const user = await prisma.user.update({
    where: { id: targetUserId },
    data: { ...data, ...(pinChanged ? { sessionVersion: { increment: 1 } } : {}) },
    select: { birthDate: true, hireDate: true, hoursOwed: true, vacationDays: true, paidDays: true }
  });
  return NextResponse.json(serialize(user));
}
