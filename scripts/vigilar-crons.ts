/**
 * Vigila los crons y avisa por Slack cuando alguno deja de correr bien.
 *
 * ⚠️ **Esto existe porque registrar un fallo no es avisarlo.** El 18 de
 * septiembre de 2026 había tres crons rotos a la vez: uno llevaba desde la
 * víspera rechazado por el wrapper --sin entregar un solo recordatorio de turno
 * de los que anuncia la APK 1.6-- y otros dos llevaban **24 días** llamando al
 * servidor viejo. Los tres escribían su error, correctamente, en archivos que
 * nadie abre.
 *
 * Se ejecuta por crontab:
 *
 *     0 13 * * *  cd /home/ubuntu/clarvex/actual && pnpm exec tsx scripts/vigilar-crons.ts \
 *                   >> /home/ubuntu/logs/vigilar-crons.log 2>&1
 *
 * ⚠️ **Sale SIEMPRE en 0.** Un vigilante que revienta se convierte en la
 * vigésima octava línea de un log que nadie mira; lo que tiene que hacer es
 * mandar el aviso y callarse.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  avisoDeProblemas,
  cadenciaEnHoras,
  CALLAN_A_PROPOSITO,
  revisarRegistros,
  sinRastro,
  type RegistroCron
} from "../lib/vigilancia-crons";
import { sendOpsAlert } from "../lib/webhooks";

const CARPETA_LOGS = process.env.CRON_LOGS_DIR ?? "/home/ubuntu/logs";

/** `VIGILAR_CRONS_SIN_AVISAR=1` imprime el diagnóstico y NO manda nada. */
const SIN_AVISAR = process.env.VIGILAR_CRONS_SIN_AVISAR === "1";

/**
 * Cuándo se tocó el crontab por última vez.
 *
 * ⚠️ Es lo que distingue «este cron nunca ha corrido» de «este cron se programó
 * hace un rato y todavía no le toca». Sin esa diferencia, el primer aviso del
 * vigilante habría sido falso.
 */
function horasDesdeElCrontab(): number | null {
  for (const ruta of [`/var/spool/cron/crontabs/${process.env.USER ?? "ubuntu"}`, "/var/spool/cron/crontabs/ubuntu"]) {
    try {
      return (Date.now() - statSync(ruta).mtimeMs) / 3_600_000;
    } catch {
      // Sin permiso o sin archivo: se prueba el siguiente.
    }
  }
  return null;
}

/** Lee el crontab del usuario. Sin él no hay nada que vigilar. */
function lineasDelCrontab(): string[] {
  try {
    return execFileSync("crontab", ["-l"], { encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
  } catch {
    return [];
  }
}

/**
 * Saca de cada línea su expresión y el archivo al que escribe.
 *
 * ⚠️ Solo se vigila lo que REDIRIGE a un archivo. Un cron sin `>>` no deja
 * rastro que mirar, y decir que está sano por no encontrar su log sería
 * justamente la clase de mentira que este guion viene a quitar.
 */
function loQueSeVigila(): RegistroCron[] {
  const desdeElCrontab = horasDesdeElCrontab();
  const porArchivo = new Map<string, number | null>();

  for (const linea of lineasDelCrontab()) {
    const destino = linea.match(/>>\s*(\S+\.log)/);
    if (!destino?.[1]) continue;
    const expresion = linea.split(/\s+/).slice(0, 5).join(" ");
    const horas = cadenciaEnHoras(expresion);
    const archivo = destino[1];
    /*
     * Varios crons pueden escribir al mismo archivo --los dos avisos de
     * asistencia lo hacen--. Se queda el margen MÁS CORTO: el archivo se toca
     * con la cadencia del más frecuente.
     */
    const previo = porArchivo.get(archivo);
    if (previo === undefined) porArchivo.set(archivo, horas);
    else if (previo !== null && horas !== null) porArchivo.set(archivo, Math.min(previo, horas));
    else porArchivo.set(archivo, null);
  }

  return [...porArchivo.entries()].map(([archivo, maxHoras]) => {
    const ruta = path.isAbsolute(archivo) ? archivo : path.join(CARPETA_LOGS, archivo);
    const nombre = path.basename(ruta, ".log");
    if (!existsSync(ruta)) {
      return { nombre, ultimaLinea: null, horasSinEscribir: null, maxHoras, horasDesdeElCrontab: desdeElCrontab };
    }

    const horasSinEscribir = (Date.now() - statSync(ruta).mtimeMs) / 3_600_000;
    // Solo el final: estos archivos crecen durante meses y no hace falta leerlos
    // enteros para saber cómo salió la última corrida.
    const cola = readFileSync(ruta, "utf8").slice(-4000).split("\n").filter((l) => l.trim().length > 0);
    const ultimaLinea = cola.length > 0 ? (cola[cola.length - 1] ?? "").trim() : "";
    return { nombre, ultimaLinea, horasSinEscribir, maxHoras, horasDesdeElCrontab: desdeElCrontab };
  });
}

async function main(): Promise<void> {
  const sello = new Date().toISOString();
  const registros = loQueSeVigila();

  if (registros.length === 0) {
    console.log(`[${sello}] [vigilar-crons] no encontré crons con registro que vigilar`);
    return;
  }

  const problemas = revisarRegistros(registros);

  // La línea de resumen va SIEMPRE, haya o no problemas: es lo que permite
  // saber después si el vigilante estuvo corriendo de verdad.
  const mudos = sinRastro(registros);
  /*
   * ⚠️ Los declarados mudos se NOMBRAN en el resumen. Quedan fuera del aviso
   * --su silencio no prueba nada-- pero callarlos del todo los volvería
   * invisibles, y una excepción que nadie vuelve a leer es como se quedan para
   * siempre. Aquí se ven sin despertar a nadie.
   */
  const declarados = registros.filter((r) => CALLAN_A_PROPOSITO.has(r.nombre)).map((r) => r.nombre);
  console.log(
    `[${sello}] [vigilar-crons] revisados ${registros.length}, con problema ${problemas.length}` +
      (mudos.length > 0 ? `, sin salida todavia: ${mudos.join(", ")}` : "") +
      (declarados.length > 0 ? `, mudos a proposito: ${declarados.join(", ")}` : "")
  );
  for (const p of problemas) console.log(`  · ${p.nombre}: ${p.motivo} — ${p.detalle}`);

  if (problemas.length === 0) return;
  if (SIN_AVISAR) {
    console.log(`[${sello}] [vigilar-crons] prueba en seco: NO se manda el aviso`);
    return;
  }

  try {
    await sendOpsAlert({
      source: "vigilar-crons",
      title: problemas.length === 1 ? "Un cron dejó de correr bien" : `${problemas.length} crons dejaron de correr bien`,
      text: avisoDeProblemas(problemas)
    });
  } catch (error) {
    console.log(`[${sello}] [vigilar-crons] no se pudo avisar: ${(error as Error).message}`);
  }
}

void main().catch((error: unknown) => {
  console.log(`[vigilar-crons] falló la revisión: ${(error as Error).message}`);
});
