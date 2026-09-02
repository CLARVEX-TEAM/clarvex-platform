/**
 * Objetivos internos de KPI (UPT, AUR, EPT, conversión…), para capturarlos
 * desde Retool.
 *
 * Son los números contra los que se pinta el semáforo de cada tarjeta. No son
 * las metas de venta: esas viven en `Kpi.dailyGoal` y las siembra la Cuota
 * Justa.
 *
 * ⚠️ **El catálogo es CERRADO.** El endpoint viejo aceptaba `metric` como
 * texto libre, así que un dedazo —«convercion»— guardaba un objetivo que no
 * casa con ninguna tarjeta: no da error, no aparece en pantalla, y el semáforo
 * de la métrica de verdad sigue sin objetivo. Nadie lo nota.
 */

export type Periodo = "SEMANA" | "MES";

export type MetricaConfig = {
  /** Cómo se le dice en pantalla. */
  etiqueta: string;
  /** Unidad, para que la pantalla sepa qué sufijo poner. */
  unidad: "veces" | "pesos" | "porcentaje";
  /** Tope razonable. Ver la nota de abajo sobre por qué existe. */
  max: number;
  /**
   * `true` cuando pasarse es MALO.
   *
   * ⚠️ Solo el margen de descuento. Es un **techo**, no una meta: superarlo
   * significa que la tienda descontó de más. Llamarlo «meta» en la pantalla
   * invita a intentar alcanzarlo, que es exactamente lo contrario.
   */
  techo?: boolean;
};

/**
 * Las nueve métricas que la app sabe pintar. Sale de `METRIC_CONFIG` en
 * `lib/kpi-view.ts`; si allí se añade una, aquí también.
 */
export const METRICAS: Record<string, MetricaConfig> = {
  upt:                     { etiqueta: "UPT",                          unidad: "veces",      max: 20 },
  aur:                     { etiqueta: "AUR",                          unidad: "pesos",      max: 100_000 },
  ept:                     { etiqueta: "EPT",                          unidad: "pesos",      max: 1_000_000 },
  conversion:              { etiqueta: "Conversión",                   unidad: "porcentaje", max: 100 },
  margen:                  { etiqueta: "Margen DTO (límite)",          unidad: "porcentaje", max: 100, techo: true },
  achievement:             { etiqueta: "Cumplimiento",                 unidad: "porcentaje", max: 1000 },
  whatsapp:                { etiqueta: "Presupuesto WhatsApp",         unidad: "pesos",      max: 1_000_000 },
  ticketElectronicoTienda: { etiqueta: "Ticket electrónico — tienda",  unidad: "porcentaje", max: 100 },
  ticketElectronicoAsesor: { etiqueta: "Ticket electrónico — asesor",  unidad: "porcentaje", max: 100 }
};

export const PERIODOS: Periodo[] = ["SEMANA", "MES"];

export type Objetivo = {
  metric: string;
  period: Periodo;
  value: number;
};

export type Rechazo = { ok: false; motivo: string };
export type Aceptado = { ok: true; valor: number };

/**
 * ¿Es válido este objetivo?
 *
 * El tope por métrica no es burocracia: **un UPT de 190 pinta la tarjeta en
 * rojo para siempre** y parece que la tienda va fatal, cuando lo que pasó fue
 * teclear `1.90` sin punto. Sin tope, ese número se guarda tan tranquilo y
 * cuesta días descubrir por qué el semáforo no cambia.
 */
export function validar(metric: string, period: string, value: unknown): Aceptado | Rechazo {
  const config = METRICAS[metric];
  if (!config) {
    return { ok: false, motivo: `«${metric}» no es una métrica que la app sepa pintar.` };
  }
  if (period !== "SEMANA" && period !== "MES") {
    return { ok: false, motivo: `El periodo debe ser SEMANA o MES, no «${period}».` };
  }

  const numero = typeof value === "string" ? Number(value.trim().replace(/,/g, "")) : value;
  if (typeof numero !== "number" || !Number.isFinite(numero)) {
    return { ok: false, motivo: `El objetivo de ${config.etiqueta} no es un número.` };
  }
  if (numero < 0) {
    // Un objetivo negativo no significa nada en ninguna de las nueve métricas.
    return { ok: false, motivo: `El objetivo de ${config.etiqueta} no puede ser negativo.` };
  }
  if (numero > config.max) {
    return {
      ok: false,
      motivo: `${config.etiqueta} no puede ser ${numero}: el máximo razonable es ${config.max}. ¿Faltó el punto decimal?`
    };
  }

  // Dos decimales: es lo que aguanta la columna (`Decimal(12,2)`). Redondear
  // aqui evita que la base lo haga en silencio y el numero guardado no sea el
  // que se tecleo.
  return { ok: true, valor: Math.round(numero * 100) / 100 };
}

/** Las nueve métricas por los dos periodos, para pintar la pantalla vacía. */
export function plantilla(): Objetivo[] {
  return Object.keys(METRICAS).flatMap((metric) =>
    PERIODOS.map((period) => ({ metric, period, value: 0 }))
  );
}
