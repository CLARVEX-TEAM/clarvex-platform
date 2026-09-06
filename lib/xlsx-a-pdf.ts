import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Convierte un XLSX a PDF con LibreOffice, en el servidor y sin red.
 *
 * ⚠️ **Por qué existe.** El XLSX que exporta Clarvex ES la plantilla corporativa
 * —`lib/weekly-performance-xlsx.ts` la abre y le mete los datos conservando
 * hojas, estilos y formato de impresión—, pero el PDF se dibujaba aparte con
 * pdf-lib, a mano y en coordenadas fijas. Eran dos generadores que no se
 * hablaban, así que el PDF se parecía al Excel solo de lejos: sin las etiquetas
 * verticales del margen, con el amarillo tiñendo bloques enteros y con las
 * secciones como bandas horizontales. Convertir el propio XLSX no se parece al
 * formato corporativo: **es** el formato corporativo.
 *
 * `lib/weekly-performance-pdf.ts` se conserva como respaldo: si LibreOffice no
 * está o falla, la exportación sigue devolviendo un PDF en vez de un error.
 */

/*
 * ⚠️ Se leen en CADA llamada, no al importar el módulo. Con una constante de
 * módulo el valor queda congelado en el primer `import` --antes incluso de que
 * el proceso termine de cargar su entorno-- y no hay forma de cubrirlo con
 * pruebas: lo destapó la prueba de abajo, que cambiaba la variable y seguía
 * viendo el binario por omisión.
 */
const binario = () => process.env.SOFFICE_BIN ?? "soffice";
const tiempoMaximoMs = () => Number(process.env.SOFFICE_TIMEOUT_MS ?? 120_000);

/** LibreOffice no está instalado, o no supo convertir. El llamador decide. */
export class ConversionPdfNoDisponible extends Error {
  constructor(motivo: string) {
    super(`No se pudo convertir el XLSX a PDF: ${motivo}`);
    this.name = "ConversionPdfNoDisponible";
  }
}

function ejecutarSoffice(carpeta: string, entrada: string): Promise<void> {
  const programa = binario();
  const limite = tiempoMaximoMs();
  return new Promise((resolve, reject) => {
    const hijo = spawn(
      programa,
      [
        "--headless",
        "--norestore",
        "--nolockcheck",
        /*
         * ⚠️ **Un perfil POR CONVERSIÓN, y no es opcional.** LibreOffice guarda
         * su estado en un perfil de usuario y **se niega a arrancar una segunda
         * instancia que use el mismo**: dos exportaciones a la vez —que es lo
         * normal con dos instancias de PM2— dejarían una de las dos colgada o
         * devolviendo un archivo a medias. La carpeta es efímera y se borra con
         * el resto.
         */
        `-env:UserInstallation=file://${carpeta.replace(/\\/g, "/")}/perfil`,
        "--convert-to",
        "pdf",
        "--outdir",
        carpeta,
        entrada
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          /*
           * ⚠️ **El idioma decide los nombres de mes.** La fila FECHA usa un
           * formato `d-mmm-yy`, así que sin esto sale «23-Aug-26» y el
           * corporativo dice «23-ago-26». Comprobado en el servidor: con estas
           * dos variables la conversión los escribe en español.
           */
          LANG: "es_MX.UTF-8",
          LC_ALL: "es_MX.UTF-8",
          // Sin HOME propio, LibreOffice escribe en el del usuario del proceso.
          HOME: carpeta
        }
      }
    );

    let error = "";
    hijo.stderr.on("data", (trozo: Buffer) => { error += trozo.toString(); });
    hijo.stdout.on("data", () => undefined);

    const reloj = setTimeout(() => {
      hijo.kill("SIGKILL");
      reject(new ConversionPdfNoDisponible(`LibreOffice tardó más de ${limite} ms`));
    }, limite);

    hijo.on("error", (fallo: NodeJS.ErrnoException) => {
      clearTimeout(reloj);
      // ENOENT es «no está instalado», que el llamador trata como respaldo.
      reject(new ConversionPdfNoDisponible(fallo.code === "ENOENT" ? `no se encontró «${programa}»` : fallo.message));
    });

    hijo.on("close", (codigo) => {
      clearTimeout(reloj);
      if (codigo === 0) return resolve();
      reject(new ConversionPdfNoDisponible(`LibreOffice salió con código ${codigo}: ${error.trim().slice(0, 300)}`));
    });
  });
}

export async function convertirXlsxAPdf(xlsx: Buffer): Promise<Buffer> {
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), "clarvex-xlsx-pdf-"));
  try {
    const entrada = path.join(carpeta, "documento.xlsx");
    await fs.writeFile(entrada, xlsx);
    await ejecutarSoffice(carpeta, entrada);

    const salida = path.join(carpeta, "documento.pdf");
    const pdf = await fs.readFile(salida).catch(() => {
      throw new ConversionPdfNoDisponible("LibreOffice terminó sin dejar el PDF");
    });

    /*
     * ⚠️ Se comprueba la CABECERA, no el código de salida. LibreOffice puede
     * salir en 0 y dejar un archivo vacío o un mensaje de error: dar eso por
     * bueno mandaría al gerente un PDF que no abre, que es peor que el respaldo.
     */
    if (pdf.length < 1_000 || pdf.subarray(0, 4).toString("latin1") !== "%PDF") {
      throw new ConversionPdfNoDisponible(`la salida no es un PDF válido (${pdf.length} bytes)`);
    }
    return pdf;
  } finally {
    await fs.rm(carpeta, { recursive: true, force: true }).catch(() => undefined);
  }
}
