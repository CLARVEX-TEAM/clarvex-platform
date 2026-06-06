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

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      employeeNumber: user.employeeNumber,
      role: user.role,
      avatar: user.name.slice(0, 2).toUpperCase()
    }
  });
}
