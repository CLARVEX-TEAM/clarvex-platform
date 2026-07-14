import { NextResponse } from "next/server";
import { enforceUploadRateLimit, isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { validateProfilePhoto } from "@/lib/profile-photo";
import { deleteFromR2, uploadToR2 } from "@/lib/r2";
import { storeKey } from "@/lib/r2-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const limited = await enforceUploadRateLimit(session.userId);
  if (limited) return limited;

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecciona una imagen." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateProfilePhoto(file, bytes);
  if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

  const key = storeKey(session.storeId, "profiles", `${session.userId}-${Date.now()}.${validation.extension}`);
  let photoUrl: string;
  try {
    photoUrl = await uploadToR2(key, bytes, file.type);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo subir la foto." }, { status: 500 });
  }

  const previous = await prisma.user.findFirst({ where: { id: session.userId }, select: { photoUrl: true } });
  if (!previous) {
    await deleteFromR2(photoUrl);
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  await prisma.user.update({ where: { id: session.userId }, data: { photoUrl } });

  if (previous.photoUrl) {
    deleteFromR2(previous.photoUrl).catch(() => undefined);
  }

  return NextResponse.json({ photoUrl });
}
