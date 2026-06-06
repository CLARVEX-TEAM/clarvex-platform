import { NextResponse } from "next/server";
import { getServerSession, SESSION_COOKIE, sessionCookieOptions, sessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesion requerida." }, { status: 401 });
  return NextResponse.json({ user: sessionUser(session) });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
