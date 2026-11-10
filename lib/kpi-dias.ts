/**
 * La venta DÍA POR DÍA de un periodo: la pestaña «Por día» de KPIs.
 *
 * Gerencia ve la tienda y, al tocar un día, cuánto vendió cada quien. El asesor
 * ve solo lo suyo: el API ya le manda únicamente sus filas, y aquí además no se
 * arma el detalle por persona cuando hay `soloUserId`.
 *
 * Sin Prisma a propósito, para poder probarlo; quien consulta es
 * `app/api/kpis/dias/route.ts`.
 *
 * ⚠️ **Una fila con SOLO la meta no es captura.** Cuota Justa escribe la meta de
 * toda la semana por adelantado con la venta en cero (ver `tieneCaptura` en
 * `lib/retool-store-agent.ts`). Sin esta distinción, el jueves saldría como
 * «vendió $0» cuando todavía no se ha capturado.
 *
 * ⚠️ **La venta puede ser NEGATIVA** por una devolución, y eso SÍ es captura.
 */

export type FilaKpiDia = {
  /** Medianoche UTC del día de tienda. */
  date: Date;
  userId: string;
  name: string;
  role: string;
  photoUrl: string | null;
  dailySales: number;
  dailyGoal: number;
  transactions: number;
  pieces: number;
  /** De la TIENDA: viene repetido en cada fila del día. */
  traffic: number | null;
};

export type PersonaDelDia = {
  userId: string;
  nombre: string;
  role: string;
  photoUrl: string | null;
  venta: number;
  meta: number;
  tickets: number;
  piezas: number;
  /** venta ÷ meta en %, o null sin meta. */
  alcance: number | null;
  capturado: boolean;
};

export type DiaDeVenta = {
  /** AAAA-MM-DD */
  fecha: string;
  venta: number;
  meta: number;
  tickets: number;
  piezas: number;
  trafico: number | null;
  alcance: number | null;
  /** ¿Alguien tiene venta, tickets o piezas ese día? */
  capturado: boolean;
  /** Vacío para el asesor. Ordenado de más a menos venta. */
  personas: PersonaDelDia[];
};

const centavos = (n: number) => Math.round(n * 100) / 100;
const alcance = (venta: number, meta: number) => (meta > 0 ? Math.round((venta / meta) * 1000) / 10 : null);
const capturo = (f: { dailySales: number; transactions: number; pieces: number }) => f.dailySales !== 0 || f.transactions > 0 || f.pieces > 0;

/**
 * Los días de `inicio` a `fin` (AAAA-MM-DD), el más reciente primero, sin pasar
 * de `hoy`: un día que todavía no llega no tiene nada que enseñar.
 */
export function ventaPorDia(filas: FilaKpiDia[], opciones: { inicio: string; fin: string; hoy: string; soloUserId: string | null }): DiaDeVenta[] {
  const { inicio, hoy, soloUserId } = opciones;
  const fin = opciones.fin < hoy ? opciones.fin : hoy;
  const porDia = new Map<string, FilaKpiDia[]>();
  for (const f of filas) {
    if (soloUserId && f.userId !== soloUserId) continue;
    const clave = f.date.toISOString().slice(0, 10);
    if (clave < inicio || clave > fin) continue;
    porDia.set(clave, [...(porDia.get(clave) ?? []), f]);
  }

  const dias: DiaDeVenta[] = [];
  for (let d = new Date(`${fin}T00:00:00.000Z`); d.toISOString().slice(0, 10) >= inicio; d = new Date(d.getTime() - 86_400_000)) {
    const fecha = d.toISOString().slice(0, 10);
    const delDia = porDia.get(fecha) ?? [];
    const venta = centavos(delDia.reduce((t, f) => t + f.dailySales, 0));
    const meta = centavos(delDia.reduce((t, f) => t + f.dailyGoal, 0));
    const trafico = delDia.reduce<number | null>((max, f) => (f.traffic == null ? max : Math.max(max ?? 0, f.traffic)), null);
    const personas: PersonaDelDia[] = soloUserId
      ? []
      : delDia
          .filter((f) => capturo(f) || f.dailyGoal > 0)
          .map((f) => ({
            userId: f.userId,
            nombre: f.name,
            role: f.role,
            photoUrl: f.photoUrl,
            venta: centavos(f.dailySales),
            meta: centavos(f.dailyGoal),
            tickets: f.transactions,
            piezas: f.pieces,
            alcance: alcance(f.dailySales, f.dailyGoal),
            capturado: capturo(f)
          }))
          .sort((a, b) => b.venta - a.venta || a.nombre.localeCompare(b.nombre, "es"));
    dias.push({
      fecha,
      venta,
      meta,
      tickets: delDia.reduce((t, f) => t + f.transactions, 0),
      piezas: delDia.reduce((t, f) => t + f.pieces, 0),
      trafico,
      alcance: alcance(venta, meta),
      capturado: delDia.some(capturo),
      personas
    });
  }
  return dias;
}
