"use client";

import { CloudOff } from "lucide-react";
import { Button, Card } from "@/components/ui";

/** Estado de error reutilizable para páginas de escritorio cuando falla la carga. */
export function DesktopError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid place-items-center py-16">
      <Card className="max-w-sm p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-950/30">
          <CloudOff size={26} />
        </span>
        <p className="mt-3 text-base font-black text-ink">No se pudieron cargar los datos</p>
        <p className="mt-1 text-sm text-muted">Revisa tu conexión e inténtalo de nuevo.</p>
        <Button className="mt-4" onClick={onRetry}>Reintentar</Button>
      </Card>
    </div>
  );
}
