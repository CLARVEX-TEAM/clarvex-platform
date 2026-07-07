"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Aviso de "cargando lento" si la sesión tarda (red floja al abrir la PWA).
    const slowTimer = setTimeout(() => { if (!cancelled) setSlow(true); }, 3500);

    // Resuelve la sesión con reintentos: un fallo de red no debe dejar la
    // pantalla en blanco para siempre. Tras varios intentos, manda al login.
    async function resolve() {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const session = await getSession();
          if (cancelled) return;
          router.replace(session?.role === "ASESOR" ? "/advisor" : session ? "/manager" : "/login");
          return;
        } catch {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        }
      }
      if (!cancelled) router.replace("/login");
    }
    void resolve();

    return () => { cancelled = true; clearTimeout(slowTimer); };
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-void px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="size-10 animate-spin rounded-full border-[3px] border-volt/25 border-t-volt" />
        <p className="text-sm font-bold text-muted">
          {slow ? "Conectando… revisa tu internet si tarda mucho." : "Cargando CLARVEX…"}
        </p>
      </div>
    </main>
  );
}
