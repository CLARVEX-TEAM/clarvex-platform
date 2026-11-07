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

/**
 * ⚠️ Un día sin venta NO es un día sin captura. Antes el bot solo veía los días
 * con venta y le decía a quien no vendió el lunes que «el lunes no está
 * capturado». Se decide por la TIENDA: si alguien capturó ese día, el día está
 * capturado, y la persona vendió lo que diga su fila (o cero).
 */
export type DiaBot = {
  fecha: Date;
  venta: number;
  meta: number;
  estado: "vendio" | "sin-venta" | "descanso" | "sin-captura";
};

/** La misma lectura que la pestaña KPIs → Comisión (`buildCommissionPerson`). */
export type ComisionBot = {
  nombre: string;
  venta: number;
  minimo: number;
  alcance: number;
  porcentaje: number;
  monto: number;
  tieneMinimo: boolean;
  siguiente: { faltan: number; porcentaje: number } | null;
};

export type ContextoBot = {
  nombre: string;
  rol: string;
  hoy: Date;
  turnos: TurnoBot[];
  ventaPersonal: VentaBot | null;
  ventaTienda: VentaBot | null;
  /** Cada día del mes retail hasta el último que la TIENDA capturó, en orden. */
  ventaPorDia: DiaBot[];
  comision: ComisionBot | null;
  /** Solo gerencia: venta y comisión de cada asesor del mes. */
  equipo: ComisionBot[];
  /** Tailored Help ya redactado; null sin campaña activa. */
  campana: string | null;
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
/** La comisión va con centavos: es el número que la persona compara con su recibo. */
const CENTAVOS = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export function describirDia(d: DiaBot): string {
  const dia = fechaCorta(d.fecha);
  if (d.estado === "descanso") return `${dia}: descanso`;
  if (d.estado === "sin-captura") return `${dia}: la tienda aún no captura ese día`;
  const alcance = d.meta > 0 ? ` (${Math.round((d.venta / d.meta) * 100)} %)` : "";
  if (d.estado === "sin-venta") return `${dia}: ${PESOS.format(0)}, no vendió${d.meta > 0 ? ` (meta ${PESOS.format(d.meta)})` : ""}`;
  return `${dia}: ${PESOS.format(d.venta)} de ${PESOS.format(d.meta)}${alcance}`;
}

const DESCANSOS = new Set(["OFF", "VACATION", "PAID_DAY", "TERMINATED"]);

/**
 * Los días del mes, del primero al último que la TIENDA capturó. Sin Prisma:
 * recibe lo ya consultado.
 */
export function armarDias(opciones: {
  inicio: Date;
  /** Último día con captura de la tienda; `null` si el mes no tiene ninguna. */
  hasta: Date | null;
  capturados: Set<string>;
  filas: Map<string, { venta: number; meta: number }>;
  horarios: Map<string, string>;
}): DiaBot[] {
  if (!opciones.hasta) return [];
  const dias: DiaBot[] = [];
  for (let t = opciones.inicio.getTime(); t <= opciones.hasta.getTime(); t += 86_400_000) {
    const fecha = new Date(t);
    const clave = fecha.toISOString().slice(0, 10);
    const fila = opciones.filas.get(clave);
    const venta = fila?.venta ?? 0;
    const meta = fila?.meta ?? 0;
    const horario = opciones.horarios.get(clave);
    let estado: DiaBot["estado"];
    if (!opciones.capturados.has(clave)) estado = "sin-captura";
    else if (venta !== 0) estado = "vendio";
    else if ((horario && DESCANSOS.has(horario)) || (!horario && meta <= 0)) estado = "descanso";
    else estado = "sin-venta";
    dias.push({ fecha, venta, meta, estado });
  }
  return dias;
}

export function describirComision(c: ComisionBot): string {
  if (!c.tieneMinimo) return `${c.nombre}: sin mínimo de comisión cargado este mes`;
  const siguiente = c.siguiente && c.siguiente.faltan > 0
    ? `; le faltan ${PESOS.format(c.siguiente.faltan)} de venta para subir a ${c.siguiente.porcentaje} %`
    : "";
  return `${c.nombre}: comisión ${CENTAVOS.format(c.monto)} (${c.porcentaje} %), venta ${PESOS.format(c.venta)} contra mínimo ${PESOS.format(c.minimo)} = ${Math.round(c.alcance)} % de alcance${siguiente}`;
}

export function armarContexto(c: ContextoBot): string {
  const lineas = [`Empleado: ${c.nombre} (${c.rol}). Hoy es ${fechaCorta(c.hoy)}.`];

  lineas.push(
    c.turnos.length
      ? `Sus turnos: ${c.turnos.map((t) => describirTurno(t, c.hoy)).join("; ")}.`
      : "Sus turnos: no hay horario capturado para los próximos días."
  );

  if (c.ventaPersonal) lineas.push(describirVenta("Su venta del mes retail", c.ventaPersonal) + ".");
  if (c.ventaPorDia.length) lineas.push(`Su venta por día este mes (días capturados por la tienda): ${c.ventaPorDia.map(describirDia).join("; ")}.`);
  if (c.comision) lineas.push(`Su comisión del mes retail a la fecha (la misma de la app): ${describirComision(c.comision)}.`);
  if (c.equipo.length) lineas.push(`Comisiones de su equipo este mes (solo gerencia puede verlas): ${c.equipo.map(describirComision).join("; ")}.`);
  if (c.ventaTienda) lineas.push(describirVenta("Venta de la tienda del mes retail", c.ventaTienda) + ".");
  if (c.campana) lineas.push(c.campana);

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

/**
 * Tailored Help en una línea para el bot. La meta es de la TIENDA: a la
 * persona se le dice cuánto aporta, nunca una meta propia que no existe.
 */
export function describirCampana(opciones: {
  semanaTienda: number;
  semanaMeta: number;
  propioSemana: number | null;
  propioTotal: number | null;
  tiendaTotal: number;
  equipo: Array<{ nombre: string; total: number }> | null;
}): string {
  const alcance = opciones.semanaMeta > 0 ? ` (${Math.round((opciones.semanaTienda / opciones.semanaMeta) * 100)} %)` : "";
  const partes = [
    `Campaña Tailored Help (donativos en caja para la escuela Christel House; la meta es de la TIENDA, por día): esta semana la tienda lleva ${PESOS.format(opciones.semanaTienda)} de ${PESOS.format(opciones.semanaMeta)}${alcance}, y ${PESOS.format(opciones.tiendaTotal)} desde que arrancó`
  ];
  if (opciones.propioSemana !== null) {
    partes.push(`esta persona aportó ${PESOS.format(opciones.propioSemana)} esta semana y ${PESOS.format(opciones.propioTotal ?? 0)} en toda la campaña`);
  }
  if (opciones.equipo?.length) {
    partes.push(`por persona esta semana (solo gerencia): ${opciones.equipo.map((p) => `${p.nombre} ${PESOS.format(p.total)}`).join(", ")}`);
  }
  return partes.join("; ") + ".";
}
