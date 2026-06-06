import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { employeeNumber } = await request.json();

  if (!employeeNumber) {
    return NextResponse.json({ error: "Numero de empleado requerido." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { employeeNumber: String(employeeNumber).trim() }
  });

  if (!user) {
    return NextResponse.json({ error: "Numero de empleado no encontrado." }, { status: 404 });
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  return NextResponse.json({
    user: {
      id: updatedUser.id,
      name: updatedUser.name,
      employeeNumber: updatedUser.employeeNumber,
      role: updatedUser.role,
      avatar: updatedUser.name.slice(0, 2).toUpperCase(),
      photoUrl: updatedUser.photoUrl,
      biometricEnabled: updatedUser.biometricEnabled,
      lastLoginAt: updatedUser.lastLoginAt?.toISOString() ?? null
    }
  });
}
