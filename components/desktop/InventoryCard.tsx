"use client";

import Link from "next/link";
import { Boxes, ChevronRight } from "lucide-react";
import { Sparkline } from "@/components/desktop/DeskCharts";
import { DeskPanel, DeskSkeleton } from "@/components/desktop/DeskUI";
import { pieces, shortDay, signedPieces, useKardex } from "@/components/desktop/useKardex";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

/**
 * Existencia teórica de hoy, en el dashboard.
 *
 * Se muestra el número junto al cambio del día: un inventario suelto no dice
 * nada, lo que se vigila es si viene bajando más de lo que debería.
 *
 * Si la tienda no tiene ronda abierta la tarjeta **no se pinta**. Un cero ahí se
 * leería como «no queda mercancía», que es justo lo contrario de lo que pasa.
 */
export function InventoryCard() {
  const { isDark } = useTheme();
  const { data, error, loading } = useKardex();

  if (error) return null;
  if (loading && !data) return <DeskSkeleton className="h-28 w-full" />;
  if (!data?.round || !data.summary) return null;

  const serie = data.daily.map((day) => day.theoretical);
  const change = data.change;

  return (
    <DeskPanel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-caption text-muted">
            <Boxes size={13} aria-hidden />
            Inventario · {data.round.name}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{pieces(data.summary.theoretical)}</p>
          <p className="mt-0.5 text-caption text-muted">
            piezas teóricas
            {change !== null ? (
              <>
                {" · "}
                <span className={cn("tabular-nums", change < 0 ? "text-danger" : change > 0 ? "text-success" : "text-muted")}>
                  {signedPieces(change)} hoy
                </span>
              </>
            ) : null}
          </p>
          <p className="mt-1 text-caption text-muted">
            Desde el inventario del {shortDay(data.round.startDate)} · base {pieces(data.round.basePieces)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {serie.length > 1 ? (
            <div className="w-32 sm:w-44">
              <Sparkline values={serie} isDark={isDark} />
            </div>
          ) : null}
          <Link href="/escritorio/kardex" className="flex items-center gap-1 text-caption font-medium text-accent hover:underline">
            Ver kardex <ChevronRight size={13} />
          </Link>
        </div>
      </div>
    </DeskPanel>
  );
}
