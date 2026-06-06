import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { employeeNumber, email, password } = await request.json();

  if ((!employeeNumber && !email) || !password) {
    return NextResponse.json({ error: "Numero de empleado o email, y password son obligatorios." }, { status: 400 });
  }

  const user = employeeNumber
    ? await prisma.user.findUnique({ where: { employeeNumber: String(employeeNumber).trim() } })
    : await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "Credenciales invalidas." }, { status: 401 });
  }

  const secret = process.env.JWT_SECRET ?? "clarvex-demo-secret";
  const token = jwt.sign({ sub: user.id, role: user.role, storeId: user.storeId }, secret, { expiresIn: "7d" });
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  return NextResponse.json({
    token,
    user: {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      employeeNumber: updatedUser.employeeNumber,
      role: updatedUser.role,
      storeId: updatedUser.storeId,
      photoUrl: updatedUser.photoUrl,
      biometricEnabled: updatedUser.biometricEnabled,
      lastLoginAt: updatedUser.lastLoginAt?.toISOString() ?? null
    }
  });
}
