/**
 * Uniforme que toca cada día.
 *
 * Sale de la hoja "HORARIO UNIFORMES" del Excel de la tienda. La tabla es fija
 * por día de la semana (no cambia semana a semana), así que no se sincroniza:
 * vive en la BD y gerencia la edita desde la app.
 *
 * Los valores de aquí son el punto de partida: si una tienda todavía no ha
 * guardado su tabla, se usa esta. La primera edición crea sus propias filas.
 */

export type UniformVariant = "MUJER" | "HOMBRE";

export type UniformDay = {
  /** 0 = domingo … 6 = sábado (igual que Date.getUTCDay()). */
  weekday: number;
  womanTop: string;
  womanBottom: string;
  manTop: string;
  manBottom: string;
  note: string | null;
};

export const WEEKDAY_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Tabla de San Agustín (hoja HORARIO UNIFORMES, jul-2026). */
export const DEFAULT_UNIFORMS: UniformDay[] = [
  { weekday: 0, womanTop: "Roja", womanBottom: "Negro", manTop: "Roja", manBottom: "Negro", note: null },
  { weekday: 1, womanTop: "Azul Marino", womanBottom: "Mezclilla Oscura", manTop: "Azul Marino", manBottom: "Mezclilla Oscura", note: null },
  { weekday: 2, womanTop: "Negra", womanBottom: "Mezclilla Clara", manTop: "Blanca", manBottom: "Mezclilla Clara", note: null },
  { weekday: 3, womanTop: "Roja", womanBottom: "Mezclilla Oscura", manTop: "Roja", manBottom: "Mezclilla Oscura", note: null },
  { weekday: 4, womanTop: "Azul Marino", womanBottom: "Mezclilla Clara", manTop: "Azul Marino", manBottom: "Mezclilla Clara", note: null },
  { weekday: 5, womanTop: "Negra", womanBottom: "Mezclilla Oscura", manTop: "Blanca", manBottom: "Mezclilla Oscura", note: null },
  {
    weekday: 6,
    womanTop: "Polo Azul Marino c/ Blanco",
    womanBottom: "Formal",
    manTop: "Camisa Azul",
    manBottom: "Café Chino",
    note: "Día formal: solo Polo/Camisa con pantalón formal o café chino."
  }
];

/** Lo que le toca a UNA persona ese día, según su variante. */
export type UniformOutfit = { top: string; bottom: string; note: string | null };

export function outfitFor(day: UniformDay, variant: UniformVariant | null): UniformOutfit {
  // Sin variante asignada se muestra la de mujer como referencia; la pantalla
  // avisa que falta asignarla. Es preferible a no mostrar nada.
  const woman = variant !== "HOMBRE";
  return {
    top: woman ? day.womanTop : day.manTop,
    bottom: woman ? day.womanBottom : day.manBottom,
    note: day.note
  };
}

/** Completa los 7 días: los que la tienda no haya guardado caen al valor por defecto. */
export function mergeWithDefaults(saved: UniformDay[]): UniformDay[] {
  const byWeekday = new Map(saved.map((day) => [day.weekday, day]));
  return DEFAULT_UNIFORMS.map((fallback) => byWeekday.get(fallback.weekday) ?? fallback);
}

/**
 * Color aproximado de una prenda, para pintar el círculo.
 * Es cosmético: si no se reconoce, se usa un gris neutro en vez de fallar.
 */
export function swatchFor(garment: string): string {
  const text = garment.toLowerCase();
  if (text.includes("roja") || text.includes("rojo")) return "#dc2626";
  if (text.includes("azul marino")) return "#1e3a8a";
  if (text.includes("azul")) return "#2563eb";
  if (text.includes("negra") || text.includes("negro")) return "#111827";
  if (text.includes("blanca") || text.includes("blanco")) return "#f8fafc";
  if (text.includes("mezclilla oscura")) return "#334155";
  if (text.includes("mezclilla clara")) return "#93c5fd";
  if (text.includes("mezclilla")) return "#475569";
  if (text.includes("café") || text.includes("chino")) return "#92400e";
  if (text.includes("formal")) return "#1f2937";
  return "#94a3b8";
}
