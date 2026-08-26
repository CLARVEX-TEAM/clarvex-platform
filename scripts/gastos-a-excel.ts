/**
 * Mete en Control_Gastos.xlsx los gastos que el bot dejo pendientes.
 *
 * Uso (VPS, via cron cada minuto):
 *   cd /home/ubuntu/clarvex-app && pnpm exec tsx scripts/gastos-a-excel.ts
 *
 * POR QUE EN DOS TIEMPOS Y NO DIRECTO DESDE n8n:
 * escribir un .xlsx obliga a reescribir el ZIP entero. Si el libro esta abierto
 * en Excel justo cuando llega un ticket, esa escritura se pierde o deja dos
 * versiones peleando. Asi el bot solo suelta un JSON --operacion que nunca
 * falla-- y este proceso lo integra cuando puede. Un gasto puede esperar un
 * minuto; perderse, no.
 *
 * ⚠️ Se edita el XML DENTRO del zip, no se reescribe el libro con una libreria.
 * `exceljs` --la del propio proyecto-- ni siquiera puede ABRIR este archivo, y
 * las librerias que lo reescriben se comen la grafica y los estilos sin avisar.
 * Mismo motivo por el que el exportador de Cuota Justa usa JSZip.
 */
import { existsSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";

const BASE = process.env.GASTOS_DIR ?? "/home/ubuntu/gastos";
const LIBRO = join(BASE, "Control_Gastos.xlsx");
const PENDIENTES = join(BASE, "pendientes");

/** Columnas de la hoja Movimientos, en su orden real. */
type Gasto = {
  fecha: string;          // YYYY-MM-DD
  hora: string;           // HH:MM
  categoria: string;
  descripcion: string;
  monto: number;
  metodoPago: string;
  comercio: string;
  comprobante: string;    // nombre del archivo de la foto
};

/**
 * Fecha a numero de serie de Excel.
 *
 * ⚠️ La epoca es el 30 de diciembre de 1899, no el 1 de enero de 1900: Excel
 * arrastra un 1900 bisiesto que nunca existio, y ese dia de mas se compensa
 * empezando dos dias antes. Con el 1 de enero, todas las fechas salen desviadas.
 */
function aSerieExcel(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  const dias = Date.UTC(a, m - 1, d) / 86_400_000;
  return dias + 25_569; // 25569 = dias entre 1899-12-30 y 1970-01-01
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Construye la fila con el MISMO estilo que las que ya tiene el libro:
 * `t="str"` con `<x:v>` para texto y los estilos s="4" (fecha) y s="2" (moneda).
 * Copiar el estilo existente no es cosmetico: si se escribe de otra forma,
 * Excel puede marcar el archivo como dañado y ofrecer repararlo.
 */
function construirFila(n: number, id: string, g: Gasto): string {
  const txt = (col: string, valor: string) =>
    valor ? `<x:c r="${col}${n}" t="str"><x:v>${escapar(valor)}</x:v></x:c>` : "";

  return (
    `<x:row r="${n}">` +
    txt("A", id) +
    `<x:c r="B${n}" s="4" t="n"><x:v>${aSerieExcel(g.fecha)}</x:v></x:c>` +
    txt("C", g.hora) +
    txt("D", "Gasto") +
    txt("E", g.categoria) +
    // F (Subcategoria) se deja vacia: el modelo no la puede saber del ticket.
    txt("G", g.descripcion) +
    `<x:c r="H${n}" s="2" t="n"><x:v>${g.monto}</x:v></x:c>` +
    txt("I", g.metodoPago) +
    // J (Cuenta) vacia por el mismo motivo que F.
    txt("K", g.comercio) +
    txt("L", "Bot") +
    // M (Mes) va con FORMULA, igual que el resto del libro. Escribir el valor a
    // mano dejaria la columna inconsistente y el Dashboard filtra por ella.
    `<x:c r="M${n}" t="str"><x:f>TEXT(B${n},"yyyy-mm")</x:f></x:c>` +
    txt("N", g.comprobante) +
    `</x:row>`
  );
}

async function main() {
  if (!existsSync(LIBRO)) throw new Error(`No encuentro el libro: ${LIBRO}`);
  if (!existsSync(PENDIENTES)) {
    console.log("[gastos] no hay carpeta de pendientes, nada que hacer.");
    return;
  }

  const todos = readdirSync(PENDIENTES).filter((f) => f.endsWith(".json")).sort();
  // Las altas se aplican ANTES que las bajas. Si llegara un ticket y un
  // /borrar en el mismo minuto, la intencion es deshacer ese ticket: al reves
  // borraria el gasto anterior, que estaba bien.
  const archivos = todos.filter((f) => !f.startsWith("borrar-"));
  const bajas = todos.filter((f) => f.startsWith("borrar-"));
  if (archivos.length === 0 && bajas.length === 0) {
    console.log("[gastos] sin pendientes.");
    return;
  }

  const zip = await JSZip.loadAsync(readFileSync(LIBRO));
  const parteHoja = zip.file("xl/worksheets/sheet1.xml");
  if (!parteHoja) throw new Error("El libro no tiene la hoja Movimientos donde esperaba.");
  let hoja = await parteHoja.async("string");

  // Siguiente fila libre y siguiente numero de ID, leidos del propio libro:
  // llevar la cuenta aparte se desincroniza en cuanto alguien escribe a mano.
  const ocupadas = [...hoja.matchAll(/<x:c r="A(\d+)"[^>]*>\s*<x:v>/g)].map((m) => Number(m[1]));
  let fila = ocupadas.length ? Math.max(...ocupadas) + 1 : 2;
  const ids = [...hoja.matchAll(/<x:v>G-(\d{4})<\/x:v>/g)].map((m) => Number(m[1]));
  let siguienteId = ids.length ? Math.max(...ids) + 1 : 1;

  const integrados: string[] = [];
  for (const archivo of archivos) {
    const ruta = join(PENDIENTES, archivo);
    let g: Gasto;
    try {
      g = JSON.parse(readFileSync(ruta, "utf8")) as Gasto;
    } catch (error) {
      console.warn(`[gastos] ⚠️  ${archivo} no es JSON valido, se deja para revisar.`);
      continue;
    }
    if (!g.fecha || typeof g.monto !== "number" || !Number.isFinite(g.monto)) {
      console.warn(`[gastos] ⚠️  ${archivo} sin fecha o sin monto, se deja para revisar.`);
      continue;
    }

    const marcador = new RegExp(`<x:row r="${fila}"[^>]*>.*?</x:row>`, "s");
    if (!marcador.test(hoja)) {
      throw new Error(`El libro no tiene fila ${fila}: se acabo el espacio (tope 5000).`);
    }
    const id = `G-${String(siguienteId).padStart(4, "0")}`;
    hoja = hoja.replace(marcador, construirFila(fila, id, g));
    console.log(`[gastos] fila ${fila}: ${id}  ${g.fecha}  ${g.comercio}  $${g.monto}`);

    fila += 1;
    siguienteId += 1;
    integrados.push(ruta);
  }

  // --- bajas: cada orden quita la ULTIMA fila con datos -----------------------
  // La fila se vacia, no se elimina: quitar el elemento correria la numeracion
  // de todas las de abajo y el libro dejaria de cuadrar con su propia tabla.
  for (const archivo of bajas) {
    const ruta = join(PENDIENTES, archivo);
    const conDatos = [...hoja.matchAll(/<x:c r="A(\d+)"[^>]*>\s*<x:v>([^<]*)<\/x:v>/g)]
      .map((m) => ({ fila: Number(m[1]), id: m[2] }))
      .filter((x) => x.fila > 1);
    if (conDatos.length === 0) {
      console.log("[gastos] /borrar sin nada que quitar.");
      integrados.push(ruta);
      continue;
    }
    const ultima = conDatos.reduce((a, b) => (b.fila > a.fila ? b : a));
    const vacia =
      `<x:row r="${ultima.fila}">` +
      `<x:c r="B${ultima.fila}" s="4" />` +
      `<x:c r="H${ultima.fila}" s="2" />` +
      `<x:c r="M${ultima.fila}" t="str"><x:f>TEXT(B${ultima.fila},"yyyy-mm")</x:f></x:c>` +
      `</x:row>`;
    hoja = hoja.replace(new RegExp(`<x:row r="${ultima.fila}"[^>]*>.*?</x:row>`, "s"), vacia);
    console.log(`[gastos] quitada la fila ${ultima.fila} (${ultima.id})`);
    integrados.push(ruta);
  }

  if (integrados.length === 0) {
    console.log("[gastos] no se integro ninguno.");
    return;
  }

  zip.file("xl/worksheets/sheet1.xml", hoja);
  const salida = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  // Se escribe a un temporal y se renombra: si el proceso muriera a mitad,
  // el libro bueno sigue intacto en vez de quedar a medio escribir.
  const temporal = `${LIBRO}.nuevo`;
  writeFileSync(temporal, salida);
  renameSync(temporal, LIBRO);

  for (const ruta of integrados) unlinkSync(ruta);
  console.log(`[gastos] ${integrados.length} gasto(s) integrados. Libro: ${(salida.length / 1024).toFixed(0)} KB`);
}

main().catch((error) => {
  console.error("[gastos] FALLÓ:", error instanceof Error ? error.message : error);
  process.exit(1);
});
