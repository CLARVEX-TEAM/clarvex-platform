import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { armarVisual, leerHuecos, medirImagen, plano } from "../lib/visual-pptx";

const EMU = 360000;
const ANCHO_LAMINA = 33.87;
const ALTO_LAMINA = 19.05;

const cm = (v: number) => Math.round(v * EMU);

/** Una forma con texto, situada donde se le diga. */
function forma(texto: string, x: number, y: number, ancho: number, alto: number): string {
  return (
    `<p:sp><p:spPr><a:xfrm><a:off x="${cm(x)}" y="${cm(y)}"/>` +
    `<a:ext cx="${cm(ancho)}" cy="${cm(alto)}"/></a:xfrm></p:spPr>` +
    `<p:txBody><a:p><a:r><a:t>${texto}</a:t></a:r></a:p></p:txBody></p:sp>`
  );
}

/** La cabecera que llevan TODAS las diapositivas de foto. */
const CABECERA = forma("San Agustin", 0.8, 1.79, 29.21, 1.36) + forma("Fall 2026", 0.8, 0.58, 3.71, 0.73);

function diapositiva(cuerpo: string): string {
  return (
    `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><p:cSld><p:spTree>` +
    // `<p:grpSpPr></p:grpSpPr>` completo, como lo escribe PowerPoint: es donde
    // armarVisual mete la foto para que quede DEBAJO del titulo.
    `<p:nvGrpSpPr/><p:grpSpPr></p:grpSpPr>${cuerpo}</p:spTree></p:cSld></p:sld>`
  );
}

/**
 * Una plantilla de mentira con la misma geometria que la real: portada, una
 * diapositiva de una foto y la de Licencias, con dos.
 */
function plantilla(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0"?><p:presentation><p:sldSz cx="${cm(ANCHO_LAMINA)}" cy="${cm(ALTO_LAMINA)}"/></p:presentation>`
  );
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types></Types>`);

  const laminas = [
    // 1. Portada: texto en la mitad de abajo pero SIN cabecera arriba.
    diapositiva(forma("REPORTE FOTOGRAFICO", 9.87, 9.53, 14.01, 0.78) + forma("SAN AGUSTIN I MONTERREY", 9.87, 10.43, 14.01, 0.78)),
    // 2. Una sola foto.
    diapositiva(CABECERA + forma("2", 32.21, 17.31, 1.03, 0.92) + forma("WSW ZONA 2", 13.03, 15.85, 4.77, 0.85)),
    // 3. Dos fotos, una a cada lado. La segunda va ANTES en el XML a proposito:
    //    el orden del archivo no tiene por que ser el de la lamina.
    diapositiva(
      CABECERA +
        forma("3", 32.21, 17.31, 1.03, 0.92) +
        forma("Licencias  2", 22.58, 15.63, 4.77, 0.85) +
        forma("Licencias 1", 6.08, 15.63, 4.77, 0.85)
    )
  ];
  laminas.forEach((xml, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, xml);
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0"?><Relationships></Relationships>`);
  });
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Un PNG de mentira: medirImagen solo mira la firma y el tamano del IHDR. */
function png(ancho: number, alto: number): Buffer {
  const buf = Buffer.alloc(32);
  buf.writeUInt8(0x89, 0);
  buf.write("PNG", 1, "ascii");
  buf.writeUInt32BE(ancho, 16);
  buf.writeUInt32BE(alto, 20);
  return buf;
}

test("la portada no es un hueco", async () => {
  const huecos = await leerHuecos(await JSZip.loadAsync(await plantilla()));
  assert.ok(!huecos.some((h) => h.slide === 1));
});

test("una etiqueta sola ocupa el ancho entero", async () => {
  const huecos = await leerHuecos(await JSZip.loadAsync(await plantilla()));
  const solo = huecos.filter((h) => h.slide === 2);
  assert.equal(solo.length, 1);
  assert.equal(solo[0].etiqueta, "WSW ZONA 2");
  assert.equal(solo[0].x, 1.1);
  // Todo el ancho util: la lamina menos los dos margenes.
  assert.ok(Math.abs(solo[0].ancho - (ANCHO_LAMINA - 2.2)) < 0.001, String(solo[0].ancho));
});

test("dos etiquetas dan DOS huecos, no uno", async () => {
  const huecos = await leerHuecos(await JSZip.loadAsync(await plantilla()));
  const dos = huecos.filter((h) => h.slide === 3);
  assert.equal(dos.length, 2);
  // ⚠️ Ordenados por su posicion, NO por el orden del XML: en la plantilla la
  // «2» aparece escrita antes que la «1».
  assert.deepEqual(dos.map((h) => h.etiqueta), ["Licencias 1", "Licencias  2"]);
});

test("y salen del MISMO tamano, uno a cada lado", async () => {
  const huecos = await leerHuecos(await JSZip.loadAsync(await plantilla()));
  const [izq, der] = huecos.filter((h) => h.slide === 3);

  assert.equal(izq.ancho, der.ancho);
  assert.equal(izq.alto, der.alto);
  assert.equal(izq.x, 1.1);
  // No se tocan, y juntos llenan el ancho util.
  assert.ok(der.x > izq.x + izq.ancho, "se solapan");
  assert.ok(Math.abs(der.x + der.ancho - (ANCHO_LAMINA - 1.1)) < 0.001);
});

test("las dos fotos acaban en la misma diapositiva, cada una en su mitad", async () => {
  const resultado = await armarVisual(await plantilla(), [
    { etiqueta: "Licencias 1", nombre: "izquierda.jpg", contenido: png(1600, 1200) },
    { etiqueta: "licencias 2", nombre: "derecha.jpg", contenido: png(1600, 1200) }
  ]);

  assert.deepEqual(resultado.sinHueco, []);
  assert.equal(resultado.colocadas.length, 2);
  assert.deepEqual(resultado.huecosVacios, ["WSW ZONA 2"]);

  const zip = await JSZip.loadAsync(resultado.archivo);
  const slide = await zip.file("ppt/slides/slide3.xml")!.async("string");
  const pics = slide.match(/<p:pic>[\s\S]*?<\/p:pic>/g) ?? [];
  assert.equal(pics.length, 2, "no quedaron dos imagenes en la lamina");

  // Cada una con su propia relacion, o PowerPoint enseñaria la misma dos veces.
  const rels = await zip.file("ppt/slides/_rels/slide3.xml.rels")!.async("string");
  const destinos = [...rels.matchAll(/Target="\.\.\/media\/([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(destinos).size, 2, `relaciones repetidas: ${destinos.join(", ")}`);

  // Una a la izquierda del centro y otra a la derecha.
  const centros = pics
    .map((p) => {
      const off = p.match(/<a:off x="(\d+)"/)![1];
      const ext = p.match(/<a:ext cx="(\d+)"/)![1];
      return (Number(off) + Number(ext) / 2) / EMU;
    })
    .sort((a, b) => a - b);
  assert.ok(centros[0] < ANCHO_LAMINA / 2, `la primera no quedo a la izquierda: ${centros[0]}`);
  assert.ok(centros[1] > ANCHO_LAMINA / 2, `la segunda no quedo a la derecha: ${centros[1]}`);
});

test("una foto no se deforma: cabe entera y conserva su proporcion", async () => {
  const resultado = await armarVisual(await plantilla(), [
    { etiqueta: "WSW ZONA 2", nombre: "una.jpg", contenido: png(1000, 2000) }
  ]);
  const zip = await JSZip.loadAsync(resultado.archivo);
  const slide = await zip.file("ppt/slides/slide2.xml")!.async("string");
  const pic = slide.match(/<p:pic>[\s\S]*?<\/p:pic>/)![0];
  const medida = pic.match(/<a:ext cx="(\d+)" cy="(\d+)"/)!;
  const ancho = Number(medida[1]) / EMU;
  const alto = Number(medida[2]) / EMU;

  // Vertical y muy alta: manda el alto del hueco, y sale una tira estrecha.
  assert.ok(Math.abs(ancho / alto - 0.5) < 0.001, `proporcion ${ancho / alto}`);
  const hueco = (await leerHuecos(await JSZip.loadAsync(await plantilla()))).find((h) => h.slide === 2)!;
  assert.ok(alto <= hueco.alto + 0.001 && ancho <= hueco.ancho + 0.001, "se sale del hueco");
});

test("medirImagen lee un PNG", () => {
  assert.deepEqual(medirImagen(png(1600, 1200)), { ancho: 1600, alto: 1200 });
});

/*
 * ⚠️ Las etiquetas de la plantilla traen espacios DOBLES («Ventana  Caballero»,
 * «Licencias  2») y el bot los colapsa al nombrar el archivo. Comparar literal
 * hacia que la foto se colocara pero siguiera figurando como que faltaba, y
 * ademas no se borraba de pendientes.
 */
test("un espacio de mas no rompe el emparejamiento", async () => {
  const resultado = await armarVisual(await plantilla(), [
    { etiqueta: "Licencias 2", nombre: "Licencias 2.jpg", contenido: png(1600, 1200) }
  ]);
  assert.deepEqual(resultado.sinHueco, []);
  assert.deepEqual(resultado.colocadas, [{ etiqueta: "Licencias  2", slide: 3 }]);
  assert.equal(plano("Licencias  2"), plano("Licencias 2"));
});
