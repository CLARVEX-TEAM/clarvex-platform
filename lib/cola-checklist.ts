/**
 * Lo que se encola del checklist, en una función pura para poder probarlo.
 *
 * ⚠️ **El DÍA viaja con la operación, y es lo más importante de este archivo.**
 * `/api/checklist` marca el ítem del día que le llegue y, si no le llega
 * ninguno, el del SERVIDOR. Sin esta línea, una foto tomada el viernes sin señal
 * y entregada el lunes marcaría la tarea del lunes: una escritura legítima, en
 * el día equivocado, que la clave de idempotencia no puede detener porque nunca
 * hubo una primera. Mandando la fecha, la entrega tardía aterriza donde debe y
 * la cola puede reintentar sin prisa.
 */

export type TareaEncolable = {
  key: string;
  label: string;
  note: string | null;
};

function base(item: TareaEncolable, fecha: string, completada: boolean): Array<[string, string | Blob]> {
  const campos: Array<[string, string | Blob]> = [
    ["itemKey", item.key],
    ["completed", String(completada)]
  ];
  // Una fecha vacía se omite: el servidor caería en su propio día, que es el
  // comportamiento de siempre. Mandar una fecha inventada sería peor.
  if (fecha) campos.push(["date", fecha]);
  if (item.note) campos.push(["note", item.note]);
  return campos;
}

/** Marcar o desmarcar la tarea. */
export function camposDeTarea(item: TareaEncolable, fecha: string, completada: boolean) {
  return base(item, fecha, completada);
}

/** La evidencia: los mismos campos más la foto, que no cambia el estado. */
export function camposDeEvidencia(
  item: TareaEncolable,
  fecha: string,
  completada: boolean,
  imagen: Blob
): Array<[string, string | Blob]> {
  return [...base(item, fecha, completada), ["image", imagen]];
}
