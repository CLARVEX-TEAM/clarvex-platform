import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { extname, join } from "node:path";
import { NextResponse } from "next/server";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { armarVisual, leerHuecos, plano, type FotoParaColocar } from "@/lib/visual-pptx";
import { semanaYTienda } from "@/lib/visual-semana";
import JSZip from "jszip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const BASE = process.env.VISUAL_DIR ?? "/home/ubuntu/visual";
const PLANTILLA = join(BASE, "plantilla.pptx");
const PENDIENTES = join(BASE, "pendientes");

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
  const listas = existsSync(PENDIENTES) ? readdirSync(PENDIENTES).filter((f) => !f.startsWith(".")) : [];

  return NextResponse.json({
    ok: true,
    huecos: huecos.map((h) => ({ slide: h.slide, etiqueta: h.etiqueta })),
    fotosListas: listas.map((f) => f.replace(extname(f), "")),
    faltan: huecos
      .map((h) => h.etiqueta)
      .filter((e) => !listas.some((f) => plano(f.replace(extname(f), "")) === plano(e)))
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

  const archivos = readdirSync(PENDIENTES).filter((f) => /\.(jpe?g|png)$/i.test(f));
  if (archivos.length === 0) {
    return NextResponse.json({ error: "No hay ninguna foto todavia." }, { status: 422 });
  }

  const fotos: FotoParaColocar[] = archivos.map((f) => ({
    // El nombre del archivo ES la etiqueta: lo puso el bot con el pie de foto.
    etiqueta: f.replace(extname(f), ""),
    nombre: f,
    contenido: readFileSync(join(PENDIENTES, f))
  }));

  const { semana, tienda, exacta } = await semanaYTienda(storeId, new Date());
  const resultado = await armarVisual(readFileSync(PLANTILLA), fotos);

  // Solo se borran las fotos que SE COLOCARON. Las que no casaron con ningun
  // hueco se quedan: son las que hay que revisar, y borrarlas obligaria a
  // volver a mandarlas sin saber cual fallo.
  for (const puesta of resultado.colocadas) {
    const archivo = archivos.find((f) => plano(f.replace(extname(f), "")) === plano(puesta.etiqueta));
    if (archivo) unlinkSync(join(PENDIENTES, archivo));
  }

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
      "X-Visual-SemanaExacta": exacta ? "1" : "0"
    }
  });
}
