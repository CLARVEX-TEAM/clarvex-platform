/**
 * Cómo se ven los mensajes de WhatsApp. Sin Prisma: se prueba solo.
 *
 * WhatsApp no tiene tablas. Lo que sí tiene es `*negrita*`, `_cursiva_` y el
 * bloque de ancho fijo con tres comillas invertidas, que alinea columnas. Un
 * teléfono muestra ~32 caracteres de ancho fijo antes de partir la línea: las
 * tablas de aquí se quedan por debajo.
 */

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function appUrl(ruta = ""): string {
  const base = (process.env.APP_URL ?? process.env.WEBAUTHN_ORIGIN ?? "https://team.clarvex.tech").replace(/\/+$/, "");
  return ruta ? `${base}${ruta.startsWith("/") ? ruta : `/${ruta}`}` : base;
}

/** «$9,155». Sin centavos: en un mensaje de teléfono estorban; la app los conserva. */
export function pesos(valor: number): string {
  const redondo = Math.round(valor);
  const texto = Math.abs(redondo).toLocaleString("en-US");
  return `${redondo < 0 ? "-" : ""}$${texto}`;
}

export function porcentaje(valor: number, meta: number): number | null {
  return meta > 0 ? Math.round((valor / meta) * 100) : null;
}

/** «Dom 9». Fechas de día de tienda a medianoche UTC. */
export function diaCorto(fecha: Date): string {
  return `${DIAS_CORTOS[fecha.getUTCDay()]} ${fecha.getUTCDate()}`;
}

/** 🟢 en meta o más, 🟡 de 85 a 99 %, 🔴 debajo. El mismo corte del semáforo de la app. */
export function semaforo(pct: number | null): string {
  if (pct === null) return "⚪";
  if (pct >= 100) return "🟢";
  if (pct >= 85) return "🟡";
  return "🔴";
}

/**
 * Tabla de ancho fijo. La primera columna se alinea a la izquierda y las demás
 * a la derecha, que es como se leen las cifras.
 */
export function tabla(filas: string[][]): string {
  const anchos: number[] = [];
  for (const fila of filas) fila.forEach((celda, i) => { anchos[i] = Math.max(anchos[i] ?? 0, [...celda].length); });
  const lineas = filas.map((fila) =>
    fila
      .map((celda, i) => {
        const relleno = " ".repeat(anchos[i] - [...celda].length);
        return i === 0 ? celda + relleno : relleno + celda;
      })
      .join("  ")
      .trimEnd()
  );
  return "```\n" + lineas.join("\n") + "\n```";
}

/**
 * El formato de cualquier aviso que no trae uno propio: título en negrita,
 * cuerpo y el enlace a la pantalla. Antes era solo el texto de la notificación.
 */
export function formatoGenerico(aviso: { title: string; body: string; url?: string }): string {
  const partes = [`*${aviso.title.trim()}*`, aviso.body.trim()];
  if (aviso.url && aviso.url.startsWith("/")) partes.push(`👉 ${appUrl(aviso.url)}`);
  return partes.filter(Boolean).join("\n\n");
}
