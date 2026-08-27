import { retailWeekRange } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";

/**
 * Numero de semana retail y nombre de tienda, para bautizar el archivo del
 * visual: `RF_W34_SAN_AGUSTIN.pptx`.
 *
 * ⚠️ El numero NO se calcula: se lee de `Kpi.weekNumber`, que es la numeracion
 * que trajo el RDV y la que usa todo lo demas. Inventar aqui una cuenta propia
 * --semanas desde el 1 de enero, ISO 8601, lo que sea-- crearia una segunda
 * numeracion que tarde o temprano se separaria de la real, y nadie sabria cual
 * de las dos mira.
 *
 * Si esa semana todavia no tiene KPIs (el reporte se hace el jueves, asi que
 * normalmente ya los hay), se deduce contando domingos desde la ultima semana
 * conocida. Es una aproximacion honesta y se avisa.
 */
export async function semanaYTienda(storeId: string, hoy: Date): Promise<{
  semana: number;
  tienda: string;
  exacta: boolean;
}> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
  if (!store) throw new Error("Tienda no encontrada.");

  // "TH SAN AGUSTIN" -> "SAN_AGUSTIN". La marca sobra: el archivo ya vive en la
  // carpeta de su tienda y el nombre queda mas corto.
  const tienda = store.name
    .replace(/^(TH|GUESS)\s+/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  const { weekStart, weekEnd } = retailWeekRange(hoy);

  const enLaSemana = await prisma.kpi.findFirst({
    where: { storeId, date: { gte: weekStart, lte: weekEnd }, weekNumber: { not: null } },
    select: { weekNumber: true }
  });
  if (enLaSemana?.weekNumber) return { semana: enLaSemana.weekNumber, tienda, exacta: true };

  // Sin KPIs de esta semana: se cuenta desde la ultima que si los tenga.
  const ultima = await prisma.kpi.findFirst({
    where: { storeId, weekNumber: { not: null }, date: { lt: weekStart } },
    orderBy: { date: "desc" },
    select: { weekNumber: true, date: true }
  });
  if (!ultima?.weekNumber) throw new Error("No hay ninguna semana de referencia para numerar el reporte.");

  const inicioUltima = retailWeekRange(ultima.date).weekStart;
  const semanas = Math.round((weekStart.getTime() - inicioUltima.getTime()) / (7 * 86_400_000));
  return { semana: ultima.weekNumber + semanas, tienda, exacta: false };
}
