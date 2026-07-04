"use client";

import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { logout } from "@/lib/auth";
import { Button, Card } from "@/components/ui";

export default function SuspendedPage() {
  const router = useRouter();

  return (
    <main className="mx-auto grid min-h-screen max-w-md place-items-center px-4">
      <Card className="w-full p-6 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-ember/10 text-ember">
          <CreditCard size={26} />
        </span>
        <h1 className="mt-4 text-lg font-black text-ink">Suscripción vencida</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          El acceso de esta tienda a Clarvex Team está pausado porque su suscripción venció.
          Pide a tu gerente que contacte al administrador de la plataforma para reactivarla.
        </p>
        <Button
          type="button"
          variant="ghost"
          className="mt-5 w-full"
          onClick={() => { void logout().then(() => router.replace("/login")); }}
        >
          Cerrar sesión
        </Button>
      </Card>
    </main>
  );
}
