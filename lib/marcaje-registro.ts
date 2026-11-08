import { captureAttendance } from "@/lib/attendance-capture";
import { prisma } from "@/lib/prisma";
import { uploadToR2 } from "@/lib/r2";
import { storeKey } from "@/lib/r2-keys";
import { mezclarAsistencia, planDeMarcaje, type LecturaMarcaje } from "@/lib/marcaje-pos";

/**
 * Una foto de la pantalla de marcaje del POS llegó al bot: registra la
 * asistencia y guarda la foto para el Forms de AXO. Devuelve qué contestarle.
 *
 * ⚠️ **Cada quien manda SU foto.** Si el número de la pantalla es de otra
 * persona, solo se acepta cuando la manda gerencia de la tienda: un asesor no
 * puede marcarle la entrada a otro.
 */

type Remitente = { userId: string; name: string | null };

const primerNombre = (nombre: string | null) => {
  const p = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
};

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export async function registrarMarcaje(opciones: {
  storeId: string;
  remitente: Remitente;
  lectura: LecturaMarcaje;
  hoy: string;
  base64: string;
  mime: string;
}): Promise<{ respuesta: string; registrado: boolean }> {
  const { storeId, remitente, lectura, hoy } = opciones;
  const plan = planDeMarcaje(lectura, hoy);
  if (!plan.ok) {
    if (plan.motivo === "otro-dia") {
      return { registrado: false, respuesta: `📅 Esa foto es del *${ddmm(plan.fecha!)}*. Mándame la de *hoy* para registrar tu asistencia.` };
    }
    return { registrado: false, respuesta: "🤔 No alcanzo a leer bien el número o la hora de la pantalla. ¿Me mandas otra foto más derecha y sin reflejo?" };
  }

  const persona = await prisma.user.findFirst({
    where: {
      storeId,
      active: true,
      OR: [{ employeeNumber: plan.numeroEmpleado }, { employeeNumberAliases: { some: { employeeNumber: plan.numeroEmpleado } } }]
    },
    select: { id: true, name: true, employeeNumber: true }
  });
  if (!persona) {
    return { registrado: false, respuesta: `🤔 El número *${plan.numeroEmpleado}* no es de nadie de la tienda. Revisa que se lea bien y mándala otra vez.` };
  }
  if (persona.id !== remitente.userId) {
    const quien = await prisma.user.findUnique({ where: { id: remitente.userId }, select: { role: true, storeId: true } });
    const esGerencia = quien?.storeId === storeId && (quien.role === "GERENTE" || quien.role === "SUBGERENTE");
    if (!esGerencia) {
      return { registrado: false, respuesta: `✋ Esa pantalla es de *${primerNombre(persona.name)}*, no tuya. Cada quien manda su propia foto.` };
    }
  }

  // Cada día por separado: la fila se reescribe ENTERA, así que se parte de la que hay.
  const porDia = new Map<string, typeof plan.escrituras>();
  for (const e of plan.escrituras) porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e]);
  const hechos: string[] = [];
  for (const [fecha, escrituras] of porDia) {
    const existente = await prisma.attendance.findUnique({
      where: { userId_date: { userId: persona.id, date: new Date(`${fecha}T00:00:00.000Z`) } },
      select: { arrivedAt: true, lunchStart: true, leftAt: true, entryText: true, note: true }
    });
    const fila = mezclarAsistencia(existente, escrituras);
    if (!fila.cambios.length) continue;
    const r = await captureAttendance(storeId, [{ employeeNumber: persona.employeeNumber, date: fecha, ...fila }]);
    if (!r.ok || r.result.errors.length) {
      console.error("[marcaje] captura", r.ok ? r.result.errors : r.errors);
      continue;
    }
    for (const c of fila.cambios) {
      const que = c.campo === "arrivedAt" ? "Entrada" : "Salida";
      hechos.push(`${que}${c.fecha === hoy ? "" : ` del ${ddmm(c.fecha)}`}: *${c.hora}*`);
    }
  }

  await guardarFoto(storeId, persona.id, hoy, plan.pantalla === "entrada" ? "ENTRADA" : "SALIDA", plan.hora, opciones.base64, opciones.mime);

  const para = persona.id === remitente.userId ? "" : ` de *${primerNombre(persona.name)}*`;
  const cuerpo = hechos.length ? `\n${hechos.join("\n")}` : "\n(ya estaba registrada así)";
  return { registrado: true, respuesta: `✅ Asistencia${para} registrada.${cuerpo}\nTu foto quedó guardada para el Forms 📸` };
}

async function guardarFoto(storeId: string, userId: string, fecha: string, accion: "ENTRADA" | "SALIDA", hora: string, base64: string, mime: string) {
  const bytes = new Uint8Array(Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64"));
  const esPng = mime.includes("png");
  const key = storeKey(storeId, "checklist", `marcaje-${fecha}-${accion.toLowerCase()}-${userId}-${Date.now()}.${esPng ? "png" : "jpg"}`);
  const mimeType = esPng ? "image/png" : "image/jpeg";
  const url = await uploadToR2(key, bytes, mimeType);
  const date = new Date(`${fecha}T00:00:00.000Z`);
  await prisma.marcajeFoto.upsert({
    where: { userId_date_accion: { userId, date, accion } },
    create: { storeId, userId, date, accion, hora, url, mimeType },
    update: { hora, url, mimeType }
  });
}
