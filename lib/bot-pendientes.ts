import { prisma } from "@/lib/prisma";
import { uploadToR2, signR2Url } from "@/lib/r2";
import { storeKey } from "@/lib/r2-keys";
import { enviarAvisoPorWhatsApp } from "@/lib/whatsapp-aviso";
import { enviarMediaPorWhatsApp } from "@/lib/whatsapp-media";
import { retirarAvisosDelPendiente } from "@/lib/pendiente-cierre";
import {
  avisoCerrado,
  avisoGerenciaCierre,
  avisoRegresado,
  diceQueTermino,
  leerDecision,
  leerEleccion,
  preguntaCual,
  primerNombre,
  respuestaAvance,
  respuestaTermine
} from "@/lib/bot-pendientes-texto";

/**
 * Pendientes y cursos por el bot de WhatsApp. Las reglas y los textos viven en
 * `lib/bot-pendientes-texto.ts`; aquí se consulta y se escribe.
 *
 * ⚠️ La persona NUNCA cierra su pendiente: dice «terminé» y queda marcado que
 * PIDIÓ CIERRE. Lo cierra gerencia, contestando «sí» al bot o desde la app,
 * después de revisar el certificado.
 */

/** Lo que el bot espera que contesten con un número caduca a la media hora. */
const ESPERA_MS = 30 * 60_000;

type Empleado = { userId: string; name: string | null; phone: string };
type Abierto = { id: string; title: string; status: "PENDIENTE" | "EN_PROCESO" | "COMPLETADO"; cierreSolicitadoAt: Date | null };

async function abiertosDe(storeId: string, userId: string): Promise<Abierto[]> {
  return prisma.pending.findMany({
    where: { storeId, ownerId: userId, status: { not: "COMPLETADO" } },
    select: { id: true, title: true, status: true, cierreSolicitadoAt: true },
    orderBy: { dueDate: "asc" }
  });
}

/**
 * A quién le llegan las evidencias y las peticiones de cierre.
 *
 * ⚠️ `WA_EVIDENCIA_USER_IDS` manda. El respaldo por nombre se queda para no
 * romper producción antes de configurarla, pero acotado a la tienda: con el
 * `LIKE` suelto, cualquier persona nueva que se llamara Adrián recibiría las
 * fotos del equipo.
 */
export async function telefonosDeGerencia(storeId: string): Promise<Array<{ phone: string }>> {
  const ids = (process.env.WA_EVIDENCIA_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length) {
    // `UserPhone` se creó a mano y no está en el esquema de Prisma: va en SQL.
    return prisma.$queryRaw<Array<{ phone: string }>>`SELECT phone FROM "UserPhone" WHERE "userId" = ANY(${ids})`;
  }
  return prisma.$queryRaw<Array<{ phone: string }>>`
    SELECT up.phone FROM "UserPhone" up JOIN "User" u ON u.id = up."userId"
    WHERE LOWER(u.name) LIKE '%adrian%' AND u."storeId" = ${storeId}
  `;
}

/** ¿Quien escribe puede cerrar pendientes? Los de la lista de evidencias, o gerencia de la tienda. */
async function esGerencia(storeId: string, userId: string): Promise<boolean> {
  const ids = (process.env.WA_EVIDENCIA_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.includes(userId)) return true;
  const u = await prisma.user.findFirst({ where: { id: userId, storeId, active: true }, select: { role: true } });
  return u?.role === "GERENTE" || u?.role === "SUBGERENTE";
}

async function telefonoDe(userId: string): Promise<string | null> {
  const filas = await prisma.$queryRaw<Array<{ phone: string }>>`SELECT phone FROM "UserPhone" WHERE "userId" = ${userId} LIMIT 1`;
  return filas[0]?.phone ?? null;
}

async function guardarEvidencia(storeId: string, userId: string, pendingId: string | null, base64: string, nota: string | null) {
  const limpio = base64.replace(/^data:[^,]+,/, "");
  const bytes = new Uint8Array(Buffer.from(limpio, "base64"));
  const key = storeKey(storeId, "evidences", `${userId}-${Date.now()}-${crypto.randomUUID()}.jpg`);
  const url = await uploadToR2(key, bytes, "image/jpeg");
  return prisma.evidence.create({
    data: { storeId, uploadedById: userId, pendingId, url, fileName: "whatsapp.jpg", mimeType: "image/jpeg", note: nota ? `WhatsApp: ${nota}`.slice(0, 500) : "Por WhatsApp" },
    select: { id: true }
  });
}

/** Un pendiente con avance deja de estar «pendiente». Nunca se cierra aquí. */
async function marcarEnProceso(p: Abierto) {
  if (p.status === "PENDIENTE") await prisma.pending.update({ where: { id: p.id }, data: { status: "EN_PROCESO" } });
}

async function esperar(userId: string, accion: "foto" | "termine", datos: { ids: string[]; evidenciaId?: string }) {
  const expiraAt = new Date(Date.now() + ESPERA_MS);
  await prisma.botEspera.upsert({ where: { userId }, create: { userId, accion, datos, expiraAt }, update: { accion, datos, expiraAt } });
}

/** Peticiones de cierre abiertas en la tienda, en el orden en que se pidieron. */
async function peticionesDeCierre(storeId: string) {
  return prisma.pending.findMany({
    where: { storeId, status: { not: "COMPLETADO" }, cierreSolicitadoAt: { not: null } },
    select: { id: true, title: true, ownerId: true, owner: { select: { name: true } } },
    orderBy: { cierreSolicitadoAt: "asc" }
  });
}

async function pedirCierre(storeId: string, empleado: Empleado, p: Abierto): Promise<string> {
  await prisma.pending.update({
    where: { id: p.id },
    data: { cierreSolicitadoAt: new Date(), ...(p.status === "PENDIENTE" ? { status: "EN_PROCESO" } : {}) }
  });
  const ultima = await prisma.evidence.findFirst({ where: { pendingId: p.id }, orderBy: { createdAt: "desc" }, select: { url: true } });
  const peticiones = await peticionesDeCierre(storeId);
  const numero = peticiones.length > 1 ? peticiones.findIndex((x) => x.id === p.id) + 1 : null;
  const texto = avisoGerenciaCierre(empleado.name ?? "", p.title, Boolean(ultima), numero);
  const firmada = ultima ? await signR2Url(ultima.url, 6 * 60 * 60) : null;
  for (const g of await telefonosDeGerencia(storeId)) {
    const conFoto = firmada ? await enviarMediaPorWhatsApp({ phone: g.phone, mediaUrl: firmada, caption: texto }) : false;
    if (!conFoto) await enviarAvisoPorWhatsApp({ phone: g.phone, text: texto });
  }
  return respuestaTermine(p.title, Boolean(ultima));
}

/**
 * Una FOTO de un empleado. Devuelve qué contestarle y para qué pendiente era,
 * o `null` si no tiene pendientes abiertos (entonces sigue el camino de siempre).
 */
export async function fotoDePendiente(storeId: string, empleado: Empleado, base64: string | null, nota: string | null): Promise<{ respuesta: string; titulo: string | null; gerenciaAvisada?: boolean } | null> {
  const abiertos = await abiertosDe(storeId, empleado.userId);
  if (abiertos.length === 0 || !base64) return null;
  if (abiertos.length === 1) {
    const p = abiertos[0];
    await guardarEvidencia(storeId, empleado.userId, p.id, base64, nota);
    // El certificado con el pie «ya terminé» es foto Y petición de cierre.
    if (!p.cierreSolicitadoAt && diceQueTermino(nota)) return { respuesta: await pedirCierre(storeId, empleado, p), titulo: p.title, gerenciaAvisada: true };
    await marcarEnProceso(p);
    return { respuesta: respuestaAvance(p.title, Boolean(p.cierreSolicitadoAt)), titulo: p.title };
  }
  // Varios abiertos: la foto se guarda sin pendiente y se pregunta de cuál es.
  const ev = await guardarEvidencia(storeId, empleado.userId, null, base64, nota);
  await esperar(empleado.userId, "foto", { ids: abiertos.map((p) => p.id), evidenciaId: ev.id });
  return { respuesta: preguntaCual("foto", abiertos.map((p) => p.title)), titulo: null };
}

/**
 * Un TEXTO: el número de una lista, «terminé» o la decisión de gerencia.
 * Devuelve la respuesta si lo manejó, o `null` para que siga la IA.
 */
export async function textoDePendiente(storeId: string, empleado: Empleado, texto: string): Promise<string | null> {
  // 1. ¿Contesta a una lista que le mandó el bot?
  const espera = await prisma.botEspera.findUnique({ where: { userId: empleado.userId } });
  if (espera && espera.expiraAt > new Date()) {
    const datos = espera.datos as { ids: string[]; evidenciaId?: string };
    const n = leerEleccion(texto, datos.ids.length);
    if (n !== null) {
      await prisma.botEspera.delete({ where: { userId: empleado.userId } });
      const p = (await abiertosDe(storeId, empleado.userId)).find((x) => x.id === datos.ids[n - 1]);
      if (!p) return "Ese pendiente ya no está abierto 🤔 Revísalo en la app.";
      if (espera.accion === "foto" && datos.evidenciaId) {
        await prisma.evidence.updateMany({ where: { id: datos.evidenciaId, uploadedById: empleado.userId, pendingId: null }, data: { pendingId: p.id } });
        await marcarEnProceso(p);
        return respuestaAvance(p.title, Boolean(p.cierreSolicitadoAt));
      }
      return pedirCierre(storeId, empleado, p);
    }
  }

  // 2. ¿Gerencia decidiendo una petición de cierre?
  const decision = leerDecision(texto);
  if (decision && (await esGerencia(storeId, empleado.userId))) {
    const peticiones = await peticionesDeCierre(storeId);
    if (peticiones.length > 0) {
      if (peticiones.length > 1 && decision.numero === null) {
        const lista = peticiones.map((p, i) => `${i + 1}. ${primerNombre(p.owner.name)} — ${p.title}`).join("\n");
        return `Hay ${peticiones.length} pendientes esperando tu revisión:\n${lista}\n\nResponde *sí N* para cerrarlo o *no N* si le falta algo.`;
      }
      const p = peticiones[(decision.numero ?? 1) - 1];
      if (!p) return `No tengo la petición ${decision.numero}. Hay ${peticiones.length}.`;
      const nombre = primerNombre(p.owner.name);
      if (decision.cerrar) {
        await prisma.$transaction(async (tx) => {
          const cerrado = await tx.pending.update({ where: { id: p.id }, data: { status: "COMPLETADO", cierreSolicitadoAt: null } });
          await retirarAvisosDelPendiente(tx, storeId, cerrado);
        });
      } else {
        await prisma.pending.update({ where: { id: p.id }, data: { cierreSolicitadoAt: null } });
      }
      if (p.ownerId !== empleado.userId) {
        const tel = await telefonoDe(p.ownerId);
        if (tel) await enviarAvisoPorWhatsApp({ phone: tel, text: decision.cerrar ? avisoCerrado(p.title) : avisoRegresado(p.title) });
      }
      return decision.cerrar
        ? `✅ Listo, cerré *${p.title}* de ${nombre}. Ya le avisé 🎉`
        : `Ok, *${p.title}* de ${nombre} sigue en progreso. Ya le avisé que le falta algo.`;
    }
  }

  // 3. ¿Avisa que terminó?
  if (diceQueTermino(texto)) {
    const abiertos = (await abiertosDe(storeId, empleado.userId)).filter((p) => !p.cierreSolicitadoAt);
    if (abiertos.length === 1) return pedirCierre(storeId, empleado, abiertos[0]);
    if (abiertos.length > 1) {
      await esperar(empleado.userId, "termine", { ids: abiertos.map((p) => p.id) });
      return preguntaCual("termine", abiertos.map((p) => p.title));
    }
  }
  return null;
}
