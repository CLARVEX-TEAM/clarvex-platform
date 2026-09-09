"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Kardex de la tienda para las pantallas de escritorio.
 *
 * Va por su cuenta y no dentro de `AppData`: ese payload ya trae la tienda
 * entera —más de mil horarios en la más cargada— y el inventario no lo necesita
 * casi ninguna pantalla. Pedirlo aparte deja el panel igual de rápido.
 */

export type KardexDay = {
  date: string;
  incoming: number;
  outgoing: number;
  sold: number;
  adjustments: number;
  theoretical: number;
};

export type KardexRound = {
  name: string;
  startDate: string;
  basePieces: number;
  endDate: string | null;
  closingPieces: number | null;
  open: boolean;
};

export type KardexSummary = {
  basePieces: number;
  received: number;
  transferredIn: number;
  customerReturns: number;
  transferredOut: number;
  shipFromStore: number;
  sold: number;
  adjustments: number;
  theoretical: number;
};

export type KardexMovement = {
  id: string;
  date: string;
  type: string;
  quantity: number;
  reference: string | null;
  counterpart: string | null;
  note: string | null;
  createdBy: string | null;
};

export type KardexPayload = {
  round: KardexRound | null;
  summary: KardexSummary | null;
  difference: number | null;
  daily: KardexDay[];
  change: number | null;
  movements: KardexMovement[];
  /** ⚠️ La lista viene cortada: la pantalla no puede presentar sus sumas como completas. */
  movementsTruncated?: boolean;
};

export function useKardex() {
  const [data, setData] = useState<KardexPayload | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/kardex", { cache: "no-store" });
      if (!response.ok) throw new Error("kardex");
      setData((await response.json()) as KardexPayload);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/** Etiquetas de los tipos de movimiento, para no repetirlas en cada pantalla. */
export const MOVEMENT_LABELS: Record<string, string> = {
  RECEPCION: "Recepción",
  TRANSFERENCIA_ENTRADA: "Traspaso entrada",
  DEVOLUCION_CLIENTE: "Devolución",
  TRANSFERENCIA_SALIDA: "Traspaso salida",
  SFS: "Ship From Store",
  AJUSTE_POSITIVO: "Ajuste a favor",
  AJUSTE_NEGATIVO: "Ajuste en contra"
};

/** Piezas con separador de miles; `—` cuando no hay dato (regla del proyecto). */
export function pieces(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-MX").format(value);
}

/** Con signo, para las variaciones del día. */
export function signedPieces(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = new Intl.NumberFormat("es-MX").format(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return "0";
}

/** "2026-08-18" → "18 ago". */
export function shortDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}
