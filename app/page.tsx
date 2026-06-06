"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    getSession().then((session) => {
      router.replace(session?.role === "ASESOR" ? "/advisor" : session ? "/manager" : "/login");
    });
  }, [router]);

  return <main className="min-h-screen bg-void" />;
}
