/**
 * Tailored Help: las cuentas de la campaña, sin Prisma, para poder probarlas.
 *
 * La meta la manda el corporativo por TIENDA y por DÍA; no hay meta por
 * persona. Lo de cada quien es su aporte a la meta de la tienda, y así se dice:
 * «llevas $X, el N % de lo que lleva la tienda». Inventarle una meta individual
 * repartiendo la de la tienda sería poner un número que nadie le pidió.
 */

export const CAMPANA_ACTUAL = "tailored-help-2026";

export const TEMA_CAMPANA = {
  nombre: "Tailored Help",
  lema: "¡Juntos construimos futuros!",
  causa: "Donativos en caja para Christel House México",
  // Salvia y crema, los colores del cartel de la campaña.
  salvia: "#5F7464",
  salviaSuave: "#E6EDE6",
  crema: "#FBF8F2",
  coral: "#E9785A"
} as const;

const DIA_MS = 86_400_000;
export const claveFecha = (fecha: Date) => fecha.toISOString().slice(0, 10);

export type MetaDia = { fecha: string; meta: number };
export type Aporte = { userId: string; fecha: string; monto: number; donativos: number };
export type PersonaCampana = { userId: string; nombre: string };

export type ResumenSemana = {
  inicio: string;
  dias: Array<{ fecha: string; meta: number; total: number; capturado: boolean }>;
  meta: number;
  total: number;
  /** null sin meta cargada: «0 %» de una meta que no existe confundiría. */
  alcance: number | null;
  personas: Array<{ userId: string; nombre: string; total: number; donativos: number; porDia: Record<string, number> }>;
};

/** Los 7 días de la semana retail (domingo a sábado) que empieza en `inicio`. */
export function fechasDeSemana(inicio: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => claveFecha(new Date(inicio.getTime() + i * DIA_MS)));
}

export function domingoDeSemana(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate() - fecha.getUTCDay()));
}

export function resumirSemana(opciones: {
  inicio: Date;
  metas: MetaDia[];
  aportes: Aporte[];
  personas: PersonaCampana[];
}): ResumenSemana {
  const fechas = fechasDeSemana(opciones.inicio);
  const metaPorDia = new Map(opciones.metas.map((m) => [m.fecha, m.meta]));
  const enSemana = opciones.aportes.filter((a) => fechas.includes(a.fecha));

  const dias = fechas.map((fecha) => {
    const delDia = enSemana.filter((a) => a.fecha === fecha);
    return {
      fecha,
      meta: metaPorDia.get(fecha) ?? 0,
      total: delDia.reduce((t, a) => t + a.monto, 0),
      // Capturado = alguien registró algo ese día, aunque sea $0.
      capturado: delDia.length > 0
    };
  });
  const meta = dias.reduce((t, d) => t + d.meta, 0);
  const total = dias.reduce((t, d) => t + d.total, 0);

  const personas = opciones.personas
    .map((p) => {
      const suyos = enSemana.filter((a) => a.userId === p.userId);
      return {
        userId: p.userId,
        nombre: p.nombre,
        total: suyos.reduce((t, a) => t + a.monto, 0),
        donativos: suyos.reduce((t, a) => t + a.donativos, 0),
        porDia: Object.fromEntries(suyos.map((a) => [a.fecha, a.monto]))
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    inicio: fechas[0],
    dias,
    meta,
    total,
    alcance: meta > 0 ? Math.round((total / meta) * 100) : null,
    personas
  };
}

/**
 * Lo que puede ver cada quien. Un asesor ve el avance de la TIENDA y lo suyo;
 * el desglose por persona es de gerencia, igual que la venta.
 */
export function vistaPara(resumen: ResumenSemana, opciones: { userId: string; gerencia: boolean }) {
  if (opciones.gerencia) return resumen;
  return { ...resumen, personas: resumen.personas.filter((p) => p.userId === opciones.userId) };
}

/** Valida un monto capturado: pesos con hasta dos decimales, no negativo, con tope. */
export function montoValido(valor: unknown): number | null {
  const n = typeof valor === "string" ? Number(valor.replace(/[$,\s]/g, "")) : Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > 100_000) return null;
  return Math.round(n * 100) / 100;
}
