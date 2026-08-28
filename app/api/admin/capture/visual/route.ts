import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { armarVisual, leerHuecos, plano, type FotoParaColocar } from "@/lib/visual-pptx";
import { PENDIENTES, PLANTILLA, etiquetaDe, guardarReferencias, leerPendientes } from "@/lib/visual-archivos";
import { esSinNombre } from "@/lib/visual-reconocer";
import { semanaYTienda } from "@/lib/visual-semana";
import JSZip from "jszip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Arma el reporte fotografico semanal con las fotos que el bot dejo en disco.
 *
 * ⚠️ Las fotos llegan por el sistema de archivos, no en el cuerpo de la
 * peticion. Son doce y pesadas: mandarlas en base64 dentro de un JSON las
 * infla un tercio y obliga a sostenerlas todas en memoria a la vez.
 *
 * Devuelve el .pptx tal cual, ya bautizado `RF_W34_SAN_AGUSTIN.pptx`.
 */
export async function GET(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  if (!existsSync(PLANTILLA)) {
    return NextResponse.json({ error: `No hay plantilla en ${PLANTILLA}.` }, { status: 404 });
  }
  const huecos = await leerHuecos(await JSZip.loadAsync(readFileSync(PLANTILLA)));
  const todas = leerPendientes();
  const listas = todas.filter((f) => !esSinNombre(f));

  return NextResponse.json({
    ok: true,
    huecos: huecos.map((h) => ({ slide: h.slide, etiqueta: h.etiqueta })),
    fotosListas: listas.map(etiquetaDe),
    // Las que llegaron sin pie no cuentan como listas: todavia no se sabe de
    // que zona son, asi que su hueco sigue vacio.
    sinNombre: todas.filter(esSinNombre).length,
    faltan: huecos
      .map((h) => h.etiqueta)
      .filter((e) => !listas.some((f) => plano(etiquetaDe(f)) === plano(e)))
  });
}

export async function POST(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const storeId = (url.searchParams.get("storeId") ?? "").trim();
  if (!storeId) return NextResponse.json({ error: "Falta storeId." }, { status: 400 });

  if (!existsSync(PLANTILLA)) {
    return NextResponse.json({ error: `No hay plantilla en ${PLANTILLA}.` }, { status: 404 });
  }
  if (!existsSync(PENDIENTES)) {
    return NextResponse.json({ error: "No hay ninguna foto todavia." }, { status: 422 });
  }

  const archivos = leerPendientes();
  if (archivos.length === 0) {
    return NextResponse.json({ error: "No hay ninguna foto todavia." }, { status: 422 });
  }

  /*
   * ⚠️ Con fotos sin reconocer NO se arma.
   *
   * Sin este freno el reporte saldria dejandolas fuera en silencio: no casan
   * con ningun hueco, asi que se reportarian como «sin hueco» y su lamina
   * quedaria vacia. Mas vale detenerse y decir que falta un paso.
   */
  const anonimas = archivos.filter(esSinNombre);
  if (anonimas.length > 0) {
    return NextResponse.json(
      { error: `Hay ${anonimas.length} foto(s) sin zona. Manda «visual reconocer» antes de armar.` },
      { status: 409 }
    );
  }

  const fotos: FotoParaColocar[] = archivos.map((f) => ({
    // El nombre del archivo ES la etiqueta: lo puso el bot con el pie de foto.
    etiqueta: etiquetaDe(f),
    nombre: f,
    contenido: readFileSync(join(PENDIENTES, f))
  }));

  const { semana, tienda, exacta } = await semanaYTienda(storeId, new Date());
  const resultado = await armarVisual(readFileSync(PLANTILLA), fotos);

  // Solo se borran las fotos que SE COLOCARON. Las que no casaron con ningun
  // hueco se quedan: son las que hay que revisar, y borrarlas obligaria a
  // volver a mandarlas sin saber cual fallo.
  /*
   * Antes de borrarla, cada foto colocada se guarda como REFERENCIA de su zona.
   *
   * Es lo que permite reconocer las de la semana que viene sin pie de foto: la
   * referencia siempre tendra siete dias, que es justo lo que hace falta cuando
   * lo que cambia entre semanas es la mercancia.
   */
  const paraReferencia: Array<{ etiqueta: string; contenido: Buffer }> = [];
  for (const puesta of resultado.colocadas) {
    const archivo = archivos.find((f) => plano(etiquetaDe(f)) === plano(puesta.etiqueta));
    if (!archivo) continue;
    paraReferencia.push({ etiqueta: puesta.etiqueta, contenido: readFileSync(join(PENDIENTES, archivo)) });
    unlinkSync(join(PENDIENTES, archivo));
  }
  const referencias = await guardarReferencias(paraReferencia);

  const nombre = `RF_W${semana}_${tienda}.pptx`;
  return new NextResponse(new Uint8Array(resultado.archivo), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "X-Visual-Nombre": nombre,
      "X-Visual-Colocadas": String(resultado.colocadas.length),
      "X-Visual-Faltan": resultado.huecosVacios.join(" | "),
      "X-Visual-SinHueco": resultado.sinHueco.join(" | "),
      "X-Visual-SemanaExacta": exacta ? "1" : "0",
      "X-Visual-Referencias": String(referencias)
    }
  });
}
