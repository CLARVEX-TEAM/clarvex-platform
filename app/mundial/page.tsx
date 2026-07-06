"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, BottomNav } from "@/components/ui";
import { MundialView } from "@/components/MundialView";

export default function MundialPage() {
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) { router.replace("/login"); return; }
      setSession(s);
    });
  }, [router]);

  const backHref = session?.role === "ASESOR" ? "/advisor" : "/manager";

  return (
    <>
      <AppHeader title="Mundial 2026" subtitle="Cuadro de la fase final" backHref={backHref} />
      <AppFrame>
        {session ? <MundialView /> : <p className="py-8 text-center text-sm font-bold text-muted">Cargando…</p>}
      </AppFrame>
      <BottomNav />
    </>
  );
}
