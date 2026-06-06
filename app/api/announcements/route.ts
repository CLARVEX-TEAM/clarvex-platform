import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { title, body, authorId } = await request.json();

  if (!title || !body || !authorId) {
    return NextResponse.json({ error: "Titulo, mensaje y autor son obligatorios." }, { status: 400 });
  }

  const author = await prisma.user.findUnique({ where: { id: authorId } });
  if (!author) {
    return NextResponse.json({ error: "Autor no encontrado." }, { status: 404 });
  }

  if (author.role === "ASESOR") {
    return NextResponse.json({ error: "Solo gerencia o subgerencia puede publicar comunicados." }, { status: 403 });
  }

  const announcement = await prisma.announcement.create({
    data: {
      storeId: author.storeId,
      authorId: author.id,
      title: String(title).trim(),
      body: String(body).trim()
    },
    include: { reads: true }
  });

  return NextResponse.json({
    announcement: {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      authorId: announcement.authorId,
      date: announcement.createdAt.toISOString().slice(0, 10),
      readBy: announcement.reads.map((read) => read.userId)
    }
  });
}
