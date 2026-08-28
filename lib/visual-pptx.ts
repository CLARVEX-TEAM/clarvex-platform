/**
 * Coloca fotos en la plantilla del reporte fotografico semanal.
 *
 * La plantilla trae 13 diapositivas: una portada y doce con su etiqueta
 * ("Fachada", "WSW ZONA 1"...) y el hueco vacio entre el titulo y esa etiqueta.
 * Aqui se mete cada foto en el hueco de su etiqueta.
 *
 * ⚠️ Se edita el XML DENTRO del zip, no se reconstruye la presentacion. Un
 * .pptx es un ZIP igual que un .xlsx, y las librerias que lo reescriben pierden
 * la maqueta: fuentes, posiciones del titulo, numeracion. Mismo motivo por el
 * que el exportador de Cuota Justa usa JSZip.
 *
 * ⚠️ Las fotos NO se recortan. Llegan ya editadas, asi que se escalan para
 * caber enteras en el hueco y se centran. Recortar por nuestra cuenta echaria a
 * perder el encuadre que ya eligio quien las tomo.
 */
import JSZip from "jszip";

/** Unidades internas de OOXML por centimetro. */
const EMU_POR_CM = 360000;

export type FotoParaColocar = {
  /** La etiqueta de la diapositiva: "Fachada", "WSW ZONA 1"... */
  etiqueta: string;
  /** Nombre original, solo para el aviso de error. */
  nombre: string;
  contenido: Buffer;
};

export type Hueco = {
  slide: number;
  etiqueta: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
};

export type ResultadoVisual = {
  colocadas: Array<{ etiqueta: string; slide: number }>;
  sinHueco: string[];
  huecosVacios: string[];
  archivo: Buffer;
};

/**
 * La clave con la que se compara una etiqueta: sin acentos, sin dobles
 * espacios y en minusculas.
 *
 * ⚠️ Se exporta porque **hay que comparar SIEMPRE con esta**. Las etiquetas de
 * la plantilla traen espacios dobles («Ventana  Caballero», «Licencias  2») y
 * el nombre del archivo que deja el bot los colapsa, asi que una comparacion
 * literal no las reconoce. La foto se colocaba bien y luego ni se borraba de
 * pendientes ni dejaba de aparecer como que faltaba.
 */
export const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Titulos de la maqueta que se repiten y no identifican ninguna foto. */
const FIJOS = new Set(["fall 2026", "spring 2026", "summer 2026", "winter 2026"]);

/**
 * Mide una imagen sin librerias.
 *
 * Hace falta para escalar sin deformar: sin las proporciones reales habria que
 * estirar la foto al hueco.
 */
export function medirImagen(buf: Buffer): { ancho: number; alto: number } | null {
  // PNG: el bloque IHDR va siempre en la misma posicion.
  if (buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG") {
    return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) };
  }
  // JPEG: hay que recorrer los marcadores hasta dar con el de inicio de cuadro.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marca = buf[i + 1];
      // SOF0..SOF15, saltando los que no describen el cuadro.
      if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
        return { alto: buf.readUInt16BE(i + 5), ancho: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** Margen lateral: el aire que se le deja a la foto contra el borde. */
const MARGEN_X = 1.1;
/** Aire entre dos fotos de la misma diapositiva. */
const SEPARACION = 0.6;

/**
 * Encuentra los huecos: para cada diapositiva, sus etiquetas y el espacio libre
 * entre el bloque de titulo y ellas.
 *
 * ⚠️ **Una diapositiva puede llevar VARIAS fotos.** La de Licencias trae dos,
 * «Licencias 1» y «Licencias 2», una a cada lado. Antes se guardaba una sola
 * etiqueta por diapositiva —la ultima que apareciera en el XML— y la otra
 * quedaba sin hueco, asi que su foto se reportaba como que no casaba con nada.
 *
 * El ancho se reparte a partes IGUALES entre las etiquetas, en su orden de
 * izquierda a derecha, no segun donde caiga cada rotulo. Dos fotos lado a lado
 * tienen que salir del mismo tamano: repartir por la posicion del texto las
 * dejaria con medio centimetro de diferencia, que es justo lo que se nota.
 *
 * Con una sola etiqueta el reparto devuelve el ancho entero, asi que las doce
 * diapositivas de siempre salen exactamente igual que antes.
 */
export async function leerHuecos(zip: JSZip): Promise<Hueco[]> {
  const huecos: Hueco[] = [];
  const nombres = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));

  const lamina = await medidaLamina(zip);

  for (const ruta of nombres) {
    const slide = Number(ruta.match(/\d+/)![0]);
    const xml = await zip.file(ruta)!.async("string");

    let finTitulo = 0;
    let inicioEtiqueta = lamina.alto;
    const etiquetas: Array<{ texto: string; centro: number }> = [];

    for (const sp of xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []) {
      const off = sp.match(/<a:off x="(-?\d+)" y="(-?\d+)"/);
      const ext = sp.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
      if (!off || !ext) continue;
      const texto = (sp.match(/<a:t>[^<]*<\/a:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join(" ").trim();
      if (!texto || /^\d+$/.test(texto)) continue; // el numero de pagina

      const y = Number(off[2]) / EMU_POR_CM;
      const alto = Number(ext[2]) / EMU_POR_CM;

      // El nombre de la tienda y la temporada encabezan TODAS: marcan el techo
      // del hueco, no lo que va en el.
      if (FIJOS.has(plano(texto)) || y < 3) {
        finTitulo = Math.max(finTitulo, y + alto);
        continue;
      }
      // Lo que queda abajo es una etiqueta de foto.
      if (y > lamina.alto / 2) {
        inicioEtiqueta = Math.min(inicioEtiqueta, y);
        etiquetas.push({ texto, centro: (Number(off[1]) + Number(ext[1]) / 2) / EMU_POR_CM });
      }
    }

    // ⚠️ La portada tambien tiene texto en la mitad inferior, asi que por si
    // sola la etiqueta no la distingue. Lo que NO tiene es cabecera arriba: en
    // las de foto siempre van el nombre de la tienda y la temporada. Sin eso,
    // no es una diapositiva de foto.
    if (etiquetas.length === 0 || finTitulo === 0) continue;

    // De izquierda a derecha, que es el orden en que se leen.
    etiquetas.sort((a, b) => a.centro - b.centro);

    const util = lamina.ancho - MARGEN_X * 2;
    const ancho = (util - SEPARACION * (etiquetas.length - 1)) / etiquetas.length;
    etiquetas.forEach((et, i) => {
      huecos.push({
        slide,
        etiqueta: et.texto,
        x: MARGEN_X + i * (ancho + SEPARACION),
        // Un margen para que la foto no toque el titulo ni la etiqueta.
        y: finTitulo + 0.2,
        ancho,
        alto: inicioEtiqueta - finTitulo - 0.4
      });
    });
  }
  return huecos;
}

async function medidaLamina(zip: JSZip): Promise<{ ancho: number; alto: number }> {
  const pres = await zip.file("ppt/presentation.xml")!.async("string");
  const sz = pres.match(/sldSz cx="(\d+)" cy="(\d+)"/);
  return sz
    ? { ancho: Number(sz[1]) / EMU_POR_CM, alto: Number(sz[2]) / EMU_POR_CM }
    : { ancho: 33.9, alto: 19.1 };
}

/** El XML de una imagen colocada, ya escalada y centrada dentro del hueco. */
function xmlFoto(id: number, rId: string, hueco: Hueco, medida: { ancho: number; alto: number } | null): string {
  let ancho = hueco.ancho;
  let alto = hueco.alto;
  if (medida && medida.ancho > 0 && medida.alto > 0) {
    // Cabe entera, sin recortar: manda la dimension que primero toca el borde.
    const escala = Math.min(hueco.ancho / medida.ancho, hueco.alto / medida.alto);
    ancho = medida.ancho * escala;
    alto = medida.alto * escala;
  }
  const x = Math.round((hueco.x + (hueco.ancho - ancho) / 2) * EMU_POR_CM);
  const y = Math.round((hueco.y + (hueco.alto - alto) / 2) * EMU_POR_CM);

  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Foto ${hueco.etiqueta}"/>` +
    `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/>` +
    `<a:ext cx="${Math.round(ancho * EMU_POR_CM)}" cy="${Math.round(alto * EMU_POR_CM)}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

export async function armarVisual(plantilla: Buffer, fotos: FotoParaColocar[]): Promise<ResultadoVisual> {
  const zip = await JSZip.loadAsync(plantilla);
  const huecos = await leerHuecos(zip);

  const porEtiqueta = new Map(huecos.map((h) => [plano(h.etiqueta), h]));
  const colocadas: ResultadoVisual["colocadas"] = [];
  const sinHueco: string[] = [];
  const usados = new Set<string>();

  // Se numeran a partir de 1000 para no chocar con los ids que ya trae.
  let siguienteId = 1000;
  let siguienteMedia = 900;

  for (const foto of fotos) {
    const hueco = porEtiqueta.get(plano(foto.etiqueta));
    if (!hueco) {
      sinHueco.push(foto.nombre);
      continue;
    }

    const ext = foto.contenido[0] === 0x89 ? "png" : "jpeg";
    const media = `image${siguienteMedia}.${ext}`;
    zip.file(`ppt/media/${media}`, foto.contenido);
    siguienteMedia += 1;

    // La relacion, que es lo que ata la diapositiva con el archivo.
    const rutaRels = `ppt/slides/_rels/slide${hueco.slide}.xml.rels`;
    let rels = await zip.file(rutaRels)!.async("string");
    const rId = `rIdFoto${siguienteId}`;
    rels = rels.replace(
      "</Relationships>",
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${media}"/></Relationships>`
    );
    zip.file(rutaRels, rels);

    // La foto va al PRINCIPIO del arbol de formas: ahi queda por DEBAJO del
    // titulo y la etiqueta. Al final las taparia.
    const rutaSlide = `ppt/slides/slide${hueco.slide}.xml`;
    let slide = await zip.file(rutaSlide)!.async("string");
    const cierreGrp = slide.indexOf("</p:grpSpPr>");
    if (cierreGrp === -1) throw new Error(`La diapositiva ${hueco.slide} no tiene el arbol de formas donde se esperaba.`);
    const corte = cierreGrp + "</p:grpSpPr>".length;
    slide = slide.slice(0, corte) + xmlFoto(siguienteId, rId, hueco, medirImagen(foto.contenido)) + slide.slice(corte);
    zip.file(rutaSlide, slide);

    siguienteId += 1;
    usados.add(plano(hueco.etiqueta));
    colocadas.push({ etiqueta: hueco.etiqueta, slide: hueco.slide });
  }

  // Que el tipo de imagen este declarado, o PowerPoint no abre el archivo.
  let tipos = await zip.file("[Content_Types].xml")!.async("string");
  for (const ext of ["png", "jpeg"]) {
    if (!new RegExp(`Extension="${ext}"`).test(tipos)) {
      tipos = tipos.replace(
        "</Types>",
        `<Default Extension="${ext}" ContentType="image/${ext}"/></Types>`
      );
    }
  }
  zip.file("[Content_Types].xml", tipos);

  return {
    colocadas: colocadas.sort((a, b) => a.slide - b.slide),
    sinHueco,
    huecosVacios: huecos.filter((h) => !usados.has(plano(h.etiqueta))).map((h) => h.etiqueta),
    archivo: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
  };
}
