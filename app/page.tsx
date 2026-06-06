"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const session = getSession();
    router.replace(session?.role === "ASESOR" ? "/advisor" : session ? "/manager" : "/login");
  }, [router]);

  return <main className="min-h-screen bg-void" />;
}
