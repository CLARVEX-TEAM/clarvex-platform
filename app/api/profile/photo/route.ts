import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { validateProfilePhoto } from "@/lib/profile-photo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecciona una imagen." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateProfilePhoto(file, bytes);
  if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

  const uploadDirectory = path.join(process.cwd(), "public", "uploads", "profiles");
  await mkdir(uploadDirectory, { recursive: true });
  const fileName = `${session.userId}-${Date.now()}.${validation.extension}`;
  const destination = path.join(uploadDirectory, fileName);
  await writeFile(destination, bytes, { flag: "wx" });
  const photoUrl = `/uploads/profiles/${fileName}`;

  const previous = await prisma.user.findFirst({ where: { id: session.userId, storeId: session.storeId }, select: { photoUrl: true } });
  if (!previous) {
    await unlink(destination).catch(() => undefined);
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  await prisma.user.update({ where: { id: session.userId }, data: { photoUrl } });
  if (previous.photoUrl?.startsWith("/uploads/profiles/")) {
    const previousName = path.basename(previous.photoUrl);
    if (previousName.startsWith(`${session.userId}-`)) await unlink(path.join(uploadDirectory, previousName)).catch(() => undefined);
  }

  return NextResponse.json({ photoUrl });
}
