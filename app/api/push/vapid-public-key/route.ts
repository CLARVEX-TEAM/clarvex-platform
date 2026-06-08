import { NextResponse } from "next/server";
import { VAPID_PUBLIC_KEY } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ vapidPublicKey: VAPID_PUBLIC_KEY });
}
