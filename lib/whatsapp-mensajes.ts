import { firstName } from "@/lib/weekly-close";
import { appUrl, diaCorto, pesos, porcentaje, semaforo, tabla } from "@/lib/whatsapp-formato";

/**
 * Los mensajes de WhatsApp con diseño propio. Sin Prisma: reciben los números
 * ya calculados y devuelven el texto, así que se prueban solos.
 *
 * Regla de todos: primero lo que la persona busca (su número), después el
 * detalle, al final el enlace. Nada de párrafos: se leen en el teléfono.
 */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «9 al 15 de noviembre» o «26 de oct al 1 de nov». */
export function rangoSemana(inicio: Date, fin: Date): string {
  if (inicio.getUTCMonth() === fin.getUTCMonth()) {
    return `${inicio.getUTCDate()} al ${fin.getUTCDate()} de ${MESES[fin.getUTCMonth()]}`;
  }
  return `${inicio.getUTCDate()} de ${MESES[inicio.getUTCMonth()].slice(0, 3)} al ${fin.getUTCDate()} de ${MESES[fin.getUTCMonth()].slice(0, 3)}`;
}

function saludo(nombre: string): string {
  const corto = firstName(nombre);
  return corto ? `Hola ${corto} 👋` : "Hola 👋";
}

// ── Cierre del día ──────────────────────────────────────────────────────────

export function cierreDelDia(opciones: { nombre: string; fecha: Date; venta: number; meta: number; cuerpo: string }): string {
  const pct = porcentaje(opciones.venta, opciones.meta);
  const lineas = [`🌙 *Cierre del día · ${diaCorto(opciones.fecha)}*`, "", saludo(opciones.nombre)];
  if (opciones.meta > 0) {
    lineas.push(`Vendiste *${pesos(opciones.venta)}* de ${pesos(opciones.meta)} → *${pct} %* ${semaforo(pct)}`);
  } else {
    lineas.push(`Vendiste *${pesos(opciones.venta)}*`);
  }
  lineas.push("", opciones.cuerpo.trim(), "", `👉 ${appUrl("/kpis")}`);
  return lineas.join("\n");
}

export function cierreDelDiaTienda(opciones: {
  fecha: Date;
  venta: number;
  meta: number;
  enMeta: number;
  cerca: number;
  abajo: number;
}): string {
  const pct = porcentaje(opciones.venta, opciones.meta);
  return [
    `🌙 *Cierre de tienda · ${diaCorto(opciones.fecha)}*`,
    "",
    `Venta *${pesos(opciones.venta)}* de ${pesos(opciones.meta)}${pct === null ? "" : ` → *${pct} %* ${semaforo(pct)}`}`,
    "",
    `🟢 En meta: ${opciones.enMeta}`,
    `🟡 Cerca: ${opciones.cerca}`,
    `🔴 Abajo: ${opciones.abajo}`,
    "",
    `👉 ${appUrl("/kpis")}`
  ].join("\n");
}

// ── Metas de la semana ──────────────────────────────────────────────────────

export type DiaMeta = { fecha: Date; meta: number; descansa: boolean };

export function totalMetas(dias: DiaMeta[]): number {
  return dias.reduce((t, d) => t + (d.descansa ? 0 : d.meta), 0);
}

export function metasDeLaSemana(opciones: {
  nombre: string;
  semana: number;
  inicio: Date;
  fin: Date;
  dias: DiaMeta[];
  actualizacion: boolean;
  /** Con tarjeta el desglose ya va en la imagen: el pie lleva solo el total. */
  conTarjeta?: boolean;
}): string {
  const filas = opciones.dias.map((d) => [diaCorto(d.fecha), d.descansa ? "descanso" : pesos(d.meta)]);
  filas.push(["Total", pesos(totalMetas(opciones.dias))]);
  const titulo = opciones.actualizacion
    ? `🔄 *Se actualizaron tus metas · semana ${opciones.semana}*`
    : `🎯 *Tus metas de la semana ${opciones.semana}*`;
  return [
    titulo,
    `_${rangoSemana(opciones.inicio, opciones.fin)}_`,
    "",
    `${saludo(opciones.nombre)} ${opciones.actualizacion ? "gerencia ajustó tus metas, quedan así:" : "ya están listas:"}`,
    opciones.conTarjeta ? `Meta de la semana: *${pesos(totalMetas(opciones.dias))}*` : tabla(filas),
    "¡A darle con todo! 💪",
    "",
    `👉 ${appUrl("/kpis")}`
  ].join("\n");
}

// ── Cierre de semana ────────────────────────────────────────────────────────

export type DiaVenta = { fecha: Date; venta: number; meta: number; descansa: boolean; capturado: boolean };

export type AnalisisSemana = {
  venta: number;
  meta: number;
  pct: number | null;
  diasTrabajados: number;
  diasEnMeta: number;
  mejor: DiaVenta | null;
  peor: DiaVenta | null;
  vsAnterior: number | null;
};

export function analizarSemana(dias: DiaVenta[], ventaAnterior: number | null): AnalisisSemana {
  const trabajados = dias.filter((d) => !d.descansa && d.capturado);
  const venta = trabajados.reduce((t, d) => t + d.venta, 0);
  const meta = dias.filter((d) => !d.descansa).reduce((t, d) => t + d.meta, 0);
  const conMeta = trabajados.filter((d) => d.meta > 0);
  const ratio = (d: DiaVenta) => d.venta / d.meta;
  const ordenados = [...conMeta].sort((a, b) => ratio(b) - ratio(a));
  return {
    venta,
    meta,
    pct: porcentaje(venta, meta),
    diasTrabajados: trabajados.length,
    diasEnMeta: conMeta.filter((d) => d.venta >= d.meta).length,
    mejor: ordenados[0] ?? null,
    // Con un solo día, el mejor y el peor son el mismo: no se dice nada del peor.
    peor: ordenados.length > 1 ? ordenados[ordenados.length - 1] : null,
    vsAnterior: ventaAnterior && ventaAnterior > 0 ? Math.round(((venta - ventaAnterior) / ventaAnterior) * 100) : null
  };
}

/**
 * El análisis es de reglas, no de IA: un número inventado en un mensaje que la
 * persona guarda en su historial es peor que un análisis sencillo.
 */
export function lineasDeAnalisis(a: AnalisisSemana): string[] {
  const lineas: string[] = [];
  if (a.diasTrabajados > 0 && a.meta > 0) lineas.push(`✅ Llegaste a tu meta en *${a.diasEnMeta} de ${a.diasTrabajados}* días.`);
  if (a.mejor && a.mejor.meta > 0) {
    lineas.push(`⭐ Tu mejor día: *${DIAS_LARGOS[a.mejor.fecha.getUTCDay()]}*, ${pesos(a.mejor.venta)} (${porcentaje(a.mejor.venta, a.mejor.meta)} %).`);
  }
  if (a.vsAnterior !== null) {
    if (a.vsAnterior > 0) lineas.push(`📈 Vendiste *${a.vsAnterior} % más* que la semana pasada.`);
    else if (a.vsAnterior < 0) lineas.push(`📉 Vendiste ${Math.abs(a.vsAnterior)} % menos que la semana pasada.`);
    else lineas.push("➡️ Vendiste lo mismo que la semana pasada.");
  }
  if (a.peor && a.peor.meta > 0 && a.peor.venta < a.peor.meta) {
    lineas.push(`🎯 Para esta semana: el *${DIAS_LARGOS[a.peor.fecha.getUTCDay()]}* fue tu día más bajo (${porcentaje(a.peor.venta, a.peor.meta)} %).`);
  }
  return lineas;
}

export function cierreDeSemana(opciones: {
  nombre: string;
  semana: number;
  inicio: Date;
  fin: Date;
  dias: DiaVenta[];
  ventaAnterior: number | null;
  conTarjeta?: boolean;
}): string {
  const a = analizarSemana(opciones.dias, opciones.ventaAnterior);
  const filas = opciones.dias.map((d) => {
    if (d.descansa) return [diaCorto(d.fecha), "descanso", ""];
    if (!d.capturado) return [diaCorto(d.fecha), "sin captura", ""];
    const pct = porcentaje(d.venta, d.meta);
    return [diaCorto(d.fecha), pesos(d.venta), pct === null ? "" : `${pct}%`];
  });
  filas.push(["Total", pesos(a.venta), a.pct === null ? "" : `${a.pct}%`]);
  const pendientes = opciones.dias.some((d) => !d.descansa && !d.capturado);
  return [
    `📊 *Tu cierre de la semana ${opciones.semana}*`,
    `_${rangoSemana(opciones.inicio, opciones.fin)}_`,
    "",
    saludo(opciones.nombre),
    `Vendiste *${pesos(a.venta)}* de ${pesos(a.meta)}${a.pct === null ? "" : ` → *${a.pct} %* ${semaforo(a.pct)}`}`,
    ...(opciones.conTarjeta ? [""] : [tabla(filas)]),
    ...lineasDeAnalisis(a),
    ...(pendientes ? ["", "_Hay días sin captura; el total puede cambiar._"] : []),
    "",
    `👉 ${appUrl("/kpis")}`
  ].join("\n");
}

export function cierreDeSemanaTienda(opciones: {
  semana: number;
  inicio: Date;
  fin: Date;
  personas: Array<{ nombre: string; venta: number; meta: number }>;
  ventaAnterior: number | null;
}): string {
  const venta = opciones.personas.reduce((t, p) => t + p.venta, 0);
  const meta = opciones.personas.reduce((t, p) => t + p.meta, 0);
  const pct = porcentaje(venta, meta);
  const ordenadas = [...opciones.personas].sort((a, b) => (porcentaje(b.venta, b.meta) ?? -1) - (porcentaje(a.venta, a.meta) ?? -1));
  const filas = ordenadas.map((p) => {
    const pp = porcentaje(p.venta, p.meta);
    return [firstName(p.nombre), pesos(p.venta), pp === null ? "" : `${pp}%`];
  });
  filas.push(["Tienda", pesos(venta), pct === null ? "" : `${pct}%`]);
  const vs = opciones.ventaAnterior && opciones.ventaAnterior > 0 ? Math.round(((venta - opciones.ventaAnterior) / opciones.ventaAnterior) * 100) : null;
  return [
    `🏬 *Cierre de tienda · semana ${opciones.semana}*`,
    `_${rangoSemana(opciones.inicio, opciones.fin)}_`,
    "",
    `Venta *${pesos(venta)}* de ${pesos(meta)}${pct === null ? "" : ` → *${pct} %* ${semaforo(pct)}`}`,
    ...(vs === null ? [] : [vs >= 0 ? `📈 ${vs} % arriba de la semana pasada` : `📉 ${Math.abs(vs)} % abajo de la semana pasada`]),
    tabla(filas),
    `👉 ${appUrl("/kpis")}`
  ].join("\n");
}
