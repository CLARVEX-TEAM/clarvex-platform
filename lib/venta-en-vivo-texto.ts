import { money } from "@/lib/format";

/**
 * El texto de la notificación de venta en vivo. Sin Prisma a propósito, para
 * poder probarlo; quien manda es `lib/venta-en-vivo.ts`.
 */

export const ETIQUETA = "venta-en-vivo";

export type DatosVenta = { venta: number; meta: number };

const pct = (d: DatosVenta) => (d.meta > 0 ? Math.round((d.venta / d.meta) * 100) : null);

export function textoVentaEnVivo(opciones: { propia: DatosVenta | null; tienda: DatosVenta | null; hora: string }): { title: string; body: string } | null {
  const { propia, tienda, hora } = opciones;
  const linea = (d: DatosVenta) => {
    const p = pct(d);
    return `${money(d.venta)}${p == null ? "" : ` · ${p} %`}`;
  };
  const falta = (d: DatosVenta, quien: string) => {
    if (d.meta <= 0) return null;
    const resta = d.meta - d.venta;
    return resta > 0 ? `${quien} faltan ${money(resta)} para la meta` : `¡${quien === "Te" ? "Tu" : "La"} meta lograda! 🎉`;
  };

  if (propia && tienda) {
    // Gerencia: la tienda manda en el título, lo suyo en el cuerpo.
    return {
      title: `Tienda hoy: ${linea(tienda)}`,
      body: [`Tú: ${linea(propia)}`, falta(tienda, "A la tienda le"), hora].filter(Boolean).join(" · ")
    };
  }
  if (tienda) return { title: `Tienda hoy: ${linea(tienda)}`, body: [falta(tienda, "A la tienda le"), hora].filter(Boolean).join(" · ") };
  if (propia) return { title: `Hoy llevas ${linea(propia)}`, body: [falta(propia, "Te"), hora].filter(Boolean).join(" · ") };
  return null;
}
