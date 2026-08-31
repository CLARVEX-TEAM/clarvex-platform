/**
 * Cómo se lee la ficha de un compañero desde el chat.
 *
 * ⚠️ Solo trata **cumpleaños y antigüedad**, que son los datos que todo el
 * equipo ve —existen para las celebraciones—. Horas, vacaciones y días pagados
 * son de gerencia o de uno mismo, y no entran aquí. Es la misma regla escrita
 * en `app/api/app-data/route.ts`; si algún día se relaja, se relaja allí y a
 * conciencia, no de rebote por una ficha del chat.
 */

/** Antigüedad en texto: «3 años y 2 meses», «5 meses», «recién ingresó». */
export function antiguedad(hireDate: string | null, hoy = new Date()): string | null {
  if (!hireDate) return null;
  const alta = new Date(`${hireDate}T00:00:00Z`);
  if (Number.isNaN(alta.getTime())) return null;

  const ref = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  if (alta > ref) return null;

  let meses =
    (ref.getUTCFullYear() - alta.getUTCFullYear()) * 12 + (ref.getUTCMonth() - alta.getUTCMonth());
  // Si aún no se llegó al día del mes, ese mes no está cumplido.
  if (ref.getUTCDate() < alta.getUTCDate()) meses -= 1;
  if (meses < 0) meses = 0;

  const años = Math.floor(meses / 12);
  const resto = meses % 12;

  if (años === 0 && resto === 0) return "recién ingresó";
  if (años === 0) return resto === 1 ? "1 mes" : `${resto} meses`;

  const parteAños = años === 1 ? "1 año" : `${años} años`;
  if (resto === 0) return parteAños;
  return `${parteAños} y ${resto === 1 ? "1 mes" : `${resto} meses`}`;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

/**
 * Cumpleaños en texto: «14 de marzo».
 *
 * ⚠️ **Sin año, a propósito.** El día se celebra; la edad no es asunto del
 * chat de la tienda.
 */
export function cumpleaños(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return null;
  const mes = Number(m[2]) - 1;
  const dia = Number(m[3]);
  if (mes < 0 || mes > 11 || dia < 1 || dia > 31) return null;
  return `${dia} de ${MESES[mes]}`;
}

/**
 * ¿Es hoy su cumpleaños?
 *
 * Se compara mes y día en texto, sin construir fechas: hacerlo con `Date`
 * arrastra la zona horaria y correría el día — el mismo fallo que ya se pagó
 * con las devoluciones y con `to_char`.
 */
export function cumpleHoy(birthDate: string | null, hoy = new Date()): boolean {
  if (!birthDate) return false;
  const mmdd = birthDate.slice(5, 10);
  const hoyMmdd = `${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  return mmdd === hoyMmdd;
}

/** Nombre del puesto tal como se le dice en tienda. */
export function puestoLegible(role: string): string {
  if (role === "GERENTE") return "Gerente";
  if (role === "SUBGERENTE") return "Subgerente";
  if (role === "REGIONAL") return "Regional";
  return "Asesor";
}
