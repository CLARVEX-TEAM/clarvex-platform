"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    getSession()
      .then((session) => {
        router.replace(session?.role === "ASESOR" ? "/advisor" : session ? "/manager" : "/login");
      })
      // Red intermitente: mejor mandar al login que dejar la pantalla en blanco.
      .catch(() => router.replace("/login"));
  }, [router]);

  return <main className="min-h-screen bg-void" />;
}
