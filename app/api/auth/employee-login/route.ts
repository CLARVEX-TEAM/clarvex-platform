import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hashPin, publicUser, verifyPin } from "@/lib/security";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export const dynamic = "force-dynamic";

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("inspect"), employeeNumber: z.string().trim().min(1).max(30) }),
  z.object({ action: z.literal("login"), employeeNumber: z.string().trim().min(1).max(30), pin: z.string().regex(/^\d{4}$/, "El PIN debe tener 4 digitos.") }),
  z.object({ action: z.literal("setup"), employeeNumber: z.string().trim().min(1).max(30), pin: z.string().regex(/^\d{4}$/, "El PIN debe tener 4 digitos.") })
]);

export async function POST(request: Request) {
  const parsed = await parseJson(request, inputSchema);
  if ("response" in parsed) return parsed.response;

  const user = await prisma.user.findUnique({ where: { employeeNumber: parsed.data.employeeNumber } });
  if (!user) return NextResponse.json({ error: "Numero de empleado no encontrado." }, { status: 404 });

  if (parsed.data.action === "inspect") {
    return NextResponse.json({ user: publicUser(user), requiresPinSetup: !user.pinHash });
  }

  if (parsed.data.action === "setup") {
    if (user.pinHash) return NextResponse.json({ error: "Este usuario ya tiene un PIN configurado." }, { status: 409 });
    user.pinHash = await hashPin(parsed.data.pin);
  } else {
    if (!user.pinHash) return NextResponse.json({ error: "Debes crear tu PIN antes de iniciar sesion." }, { status: 409 });
    if (!(await verifyPin(parsed.data.pin, user.pinHash))) {
      return NextResponse.json({ error: "PIN incorrecto." }, { status: 401 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { pinHash: user.pinHash, lastLoginAt: new Date() }
  });
  const token = await createSessionToken(updated);
  const response = NextResponse.json({ user: publicUser(updated) });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
