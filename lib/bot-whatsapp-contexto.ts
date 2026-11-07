/**
 * Lo que el bot de WhatsApp sabe de la persona que le escribe, en texto.
 *
 * Sin Prisma a propósito: las reglas viven aquí y las consultas en
 * `bot-whatsapp-datos.ts`, para poder probarlas sin base.
 *
 * ⚠️ **Solo datos de QUIEN escribe.** El bot habla con asesores; si el contexto
 * llevara la venta de otra persona, bastaría con preguntarle para enterarse. La
 * venta de tienda se añade solo para gerencia, igual que en la app.
 */

export type TurnoBot = {
  /** Fecha del día de tienda (medianoche UTC). */
  fecha: Date;
  status: string;
  inicio: string | null;
  fin: string | null;
};

export type VentaBot = {
  venta: number;
  meta: number;
  /** Último día con venta capturada; `null` si el mes no tiene ninguna. */
  ultimaCaptura: Date | null;
};

export type ContextoBot = {
  nombre: string;
  rol: string;
  hoy: Date;
  turnos: TurnoBot[];
  ventaPersonal: VentaBot | null;
  ventaTienda: VentaBot | null;
  /** Días del mes retail con venta capturada, en orden. */
  ventaPorDia: Array<{ fecha: Date; venta: number; meta: number }>;
  pendientes: Array<{ titulo: string; vence: Date }>;
  comunicadosSinLeer: string[];
  cursos: string[];
  tareaFija: string;
};

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «lunes 9 nov». Las fechas son medianoche UTC del día de tienda: se leen en UTC. */
export function fechaCorta(fecha: Date): string {
  return `${DIAS[fecha.getUTCDay()]} ${fecha.getUTCDate()} ${MESES[fecha.getUTCMonth()]}`;
}

function diaRelativo(fecha: Date, hoy: Date): string {
  const dias = Math.round((fecha.getTime() - hoy.getTime()) / 86_400_000);
  if (dias === 0) return `hoy (${fechaCorta(fecha)})`;
  if (dias === 1) return `mañana (${fechaCorta(fecha)})`;
  return fechaCorta(fecha);
}

export function describirTurno(turno: TurnoBot, hoy: Date): string {
  const cuando = diaRelativo(turno.fecha, hoy);
  switch (turno.status) {
    case "OFF":
      return `${cuando}: descanso`;
    case "VACATION":
      return `${cuando}: vacaciones`;
    case "PAID_DAY":
      return `${cuando}: día pagado`;
    case "TERMINATED":
      return `${cuando}: sin turno`;
    default: {
      const horas = turno.inicio && turno.fin ? `${turno.inicio} a ${turno.fin}` : "horario sin capturar";
      return `${cuando}: ${turno.status === "INVENTORY" ? "inventario, " : ""}${horas}`;
    }
  }
}

const PESOS = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

/**
 * ⚠️ La venta se captura al día siguiente, así que «hoy» casi nunca está. Se dice
 * hasta qué día llega para que el bot no afirme que alguien va atrasado por un
 * día que todavía nadie capturó.
 */
export function describirVenta(etiqueta: string, venta: VentaBot): string {
  if (!venta.ultimaCaptura) return `${etiqueta}: todavía sin venta capturada este mes`;
  const alcance = venta.meta > 0 ? `, ${Math.round((venta.venta / venta.meta) * 100)} % de la meta del mes` : "";
  return `${etiqueta}: ${PESOS.format(venta.venta)} de ${PESOS.format(venta.meta)}${alcance} (capturado hasta el ${fechaCorta(venta.ultimaCaptura)})`;
}

export function describirDia(d: { fecha: Date; venta: number; meta: number }): string {
  const alcance = d.meta > 0 ? ` (${Math.round((d.venta / d.meta) * 100)} %)` : "";
  return `${fechaCorta(d.fecha)} ${PESOS.format(d.venta)} de ${PESOS.format(d.meta)}${alcance}`;
}

export function armarContexto(c: ContextoBot): string {
  const lineas = [`Empleado: ${c.nombre} (${c.rol}). Hoy es ${fechaCorta(c.hoy)}.`];

  lineas.push(
    c.turnos.length
      ? `Sus turnos: ${c.turnos.map((t) => describirTurno(t, c.hoy)).join("; ")}.`
      : "Sus turnos: no hay horario capturado para los próximos días."
  );

  if (c.ventaPersonal) lineas.push(describirVenta("Su venta del mes retail", c.ventaPersonal) + ".");
  if (c.ventaPorDia.length) lineas.push(`Su venta por día este mes: ${c.ventaPorDia.map(describirDia).join("; ")}.`);
  if (c.ventaTienda) lineas.push(describirVenta("Venta de la tienda del mes retail", c.ventaTienda) + ".");

  const pendientes = [c.tareaFija, ...c.pendientes.map((p) => `${p.titulo} (vence ${fechaCorta(p.vence)})`)];
  if (c.cursos.length) pendientes.push(`cursos sin aprobar: ${c.cursos.join(", ")}`);
  lineas.push(`Sus pendientes: ${pendientes.join(" · ")}.`);

  if (c.comunicadosSinLeer.length) {
    lineas.push(`Comunicados que no ha leído en la app: ${c.comunicadosSinLeer.join("; ")}.`);
  }
  return lineas.join("\n");
}

/**
 * ¿Una foto es evidencia o una pregunta con foto?
 *
 * ⚠️ Antes TODA imagen se reenviaba a gerencia como evidencia. Quien manda una
 * foto preguntando algo («¿esto va en la bodega?») recibía «evidencia
 * recibida» y no le contestaba nadie. Se decide por el pie: una pregunta se
 * contesta; lo demás sigue siendo evidencia, que es el caso común.
 */
export function esPreguntaConFoto(pie: string | null): boolean {
  if (!pie) return false;
  const texto = pie.trim().toLowerCase();
  if (texto.includes("?") || texto.includes("¿")) return true;
  return /^(qu[eé]|c[oó]mo|d[oó]nde|cu[aá]ndo|cu[aá]l|por qu[eé]|puedo|se puede|esto)\b/.test(texto);
}

/**
 * Bedrock exige que la conversación empiece por el usuario y alterne. El
 * historial guardado es [usuario, bot, usuario, bot…], pero uno cortado a la
 * mitad o una respuesta perdida lo descuadran; se arregla aquí en vez de
 * dejar que Bedrock rechace el mensaje entero.
 */
export function turnosAlternados(
  historial: string[],
  mensaje: string
): Array<{ role: "user" | "assistant"; text: string }> {
  const turnos = historial.map((text, i) => ({ role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant", text }));
  turnos.push({ role: "user", text: mensaje });
  const limpios: Array<{ role: "user" | "assistant"; text: string }> = [];
  for (const t of turnos) {
    if (!t.text.trim()) continue;
    const previo = limpios[limpios.length - 1];
    if (previo && previo.role === t.role) previo.text += `\n${t.text}`;
    else limpios.push({ ...t });
  }
  while (limpios.length && limpios[0].role !== "user") limpios.shift();
  return limpios;
}
