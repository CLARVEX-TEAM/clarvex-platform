/**
 * Quién cuenta como PERSONA de la tienda.
 *
 * Existe porque el usuario "kiosko" —el celular de la tienda que solo sirve para
 * los escaneos del cierre— está dado de alta con rol ASESOR. Filtrar por
 * `role: "ASESOR"` a secas lo incluye, y entonces:
 *
 *  · sale en la plantilla de Asistencia como si fuera alguien;
 *  · cuenta como un asesor con CERO venta en el resumen de cierre, que fue
 *    exactamente el «Abajo: 1 asesores» de una noche en que solo trabajó una
 *    persona y sí llegó a su meta;
 *  · recibe plan del día, alertas de bajo desempeño y felicitaciones de meta.
 *
 * Se coló en OCHO consultas distintas, así que la definición vive aquí y no
 * repetida en cada una. Un aparato no es un asesor.
 */

/** Asesores de verdad: excluye al kiosko y a las cuentas desactivadas. */
export const ADVISOR_WHERE = {
  role: "ASESOR" as const,
  active: true,
  checklistOnly: false
};

/** Cualquier persona real de la tienda, sin importar el puesto. */
export const PERSON_WHERE = {
  active: true,
  checklistOnly: false
};

/** ¿Este registro es una persona y no el aparato de la tienda? */
export function isRealPerson(user: { active?: boolean; checklistOnly?: boolean }): boolean {
  return user.active !== false && user.checklistOnly !== true;
}
