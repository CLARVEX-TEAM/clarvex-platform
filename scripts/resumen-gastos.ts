/**
 * Deja preparado el resumen del mes que responde el comando /gastos del bot.
 *
 * Uso (VPS, via cron cada minuto, justo despues de gastos-a-excel):
 *   cd /home/ubuntu/clarvex-app && pnpm exec tsx scripts/resumen-gastos.ts
 *
 * POR QUE UN ARCHIVO Y NO CALCULARLO EN n8n: n8n tendria que abrir y parsear
 * un .xlsx en cada consulta. Aqui ya sabemos hacerlo, asi que el bot solo lee
 * un texto ya escrito. Ademas se refresca aunque edites el libro a mano en
 * Excel, porque se recalcula del libro y no de lo que paso por el bot.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";

const BASE = process.env.GASTOS_DIR ?? "/home/ubuntu/gastos";
const LIBRO = join(BASE, "Control_Gastos.xlsx");
const SALIDA = join(BASE, "resumen.txt");

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
               "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Numero de serie de Excel a fecha. La epoca es 1899-12-30, ver gastos-a-excel.ts. */
function deSerieExcel(n: number): Date {
  return new Date((n - 25_569) * 86_400_000);
}

function pesos(n: number): string {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Saca el valor de una celda de una fila ya aislada. */
function celda(fila: string, col: string): string | null {
  const m = fila.match(new RegExp(`<x:c r="${col}\\d+"[^>]*>\\s*<x:v>([^<]*)</x:v>`));
  return m ? m[1] : null;
}

async function main() {
  if (!existsSync(LIBRO)) throw new Error(`No encuentro el libro: ${LIBRO}`);
  const zip = await JSZip.loadAsync(readFileSync(LIBRO));

  // --- presupuestos, de la hoja Categorias ------------------------------------
  const hojaCat = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
  const presupuesto = new Map<string, number>();
  for (const fila of hojaCat.match(/<x:row[^>]*>.*?<\/x:row>/gs) ?? []) {
    const nombre = celda(fila, "A");
    const monto = Number(celda(fila, "C"));
    if (nombre && nombre !== "Categoria" && Number.isFinite(monto)) presupuesto.set(nombre, monto);
  }

  // --- movimientos ------------------------------------------------------------
  const hoja = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  const ahora = new Date(Date.now() - 6 * 3600 * 1000); // Monterrey, UTC-6 todo el año
  const anio = ahora.getUTCFullYear();
  const mes = ahora.getUTCMonth();

  const porCategoria = new Map<string, number>();
  let gastos = 0;
  let ingresos = 0;
  let cuantos = 0;

  for (const fila of hoja.match(/<x:row[^>]*>.*?<\/x:row>/gs) ?? []) {
    const serie = Number(celda(fila, "B"));
    const tipo = celda(fila, "D");
    const monto = Number(celda(fila, "H"));
    if (!Number.isFinite(serie) || !serie || !Number.isFinite(monto) || !tipo) continue;

    // ⚠️ El mes se calcula de la FECHA, no de la columna Mes. Esa columna es una
    // formula y su resultado solo existe cuando Excel abre el archivo: leida
    // desde aqui viene vacia y todos los meses saldrian en cero.
    const f = deSerieExcel(serie);
    if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes) continue;

    if (tipo === "Ingreso") {
      ingresos += monto;
      continue;
    }
    gastos += monto;
    cuantos += 1;
    const cat = celda(fila, "E") || "Otros";
    porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + monto);
  }

  // --- texto ------------------------------------------------------------------
  const lineas: string[] = [];
  lineas.push(`${MESES[mes]} de ${anio}`);
  lineas.push("");

  if (cuantos === 0) {
    lineas.push("Todavia no hay gastos este mes.");
  } else {
    const orden = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);
    for (const [cat, total] of orden) {
      const tope = presupuesto.get(cat);
      // El aviso solo aparece al pasarse: un presupuesto es un techo, y marcar
      // en verde lo que va por debajo llenaria el mensaje de ruido.
      const alerta = tope && total > tope ? "  ⚠️" : "";
      lineas.push(`${cat}: ${pesos(total)}${tope ? ` de ${pesos(tope)}` : ""}${alerta}`);
    }
    lineas.push("");
    const topeTotal = [...presupuesto.values()].reduce((a, b) => a + b, 0);
    lineas.push(`Total: ${pesos(gastos)} de ${pesos(topeTotal)}`);
    if (ingresos > 0) {
      lineas.push(`Ingresos: ${pesos(ingresos)}`);
      lineas.push(`Balance: ${pesos(ingresos - gastos)}`);
    }
    lineas.push("");
    lineas.push(`${cuantos} movimiento(s) registrados.`);
  }

  const texto = lineas.join("\n");
  writeFileSync(SALIDA, texto, "utf8");
  console.log(`[resumen] ${cuantos} gasto(s) del mes, ${SALIDA} actualizado.`);
}

main().catch((error) => {
  console.error("[resumen] FALLÓ:", error instanceof Error ? error.message : error);
  process.exit(1);
});
