import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { NextResponse } from "next/server";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { leerHuecos, plano } from "@/lib/visual-pptx";
import {
  PENDIENTES,
  PLANTILLA,
  PROPUESTA,
  encoger,
  etiquetaDe,
  leerPendientes,
  leerReferencias
} from "@/lib/visual-archivos";
import {
  cambiarZona,
  construirPrompt,
  esSinNombre,
  interpretarReparto,
  type Asignacion,
  type FotoAnonima
} from "@/lib/visual-reconocer";
import { reconocerConfigurado, repartirConBedrock } from "@/lib/visual-reconocer-bedrock";
import JSZip from "jszip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * Averigua a que zona va cada foto que llego SIN pie, comparandola con las de
 * la semana pasada.
 *
 * Tres pasos, y el del medio no se salta:
 *
 *   GET                       propone el reparto y lo deja guardado
 *   POST ?accion=cambiar      corrige una, intercambiando con quien la tuviera
 *   POST ?accion=aplicar      bautiza las fotos con su zona
 *
 * ⚠️ **Proponer y aplicar van separados A PROPOSITO.** Acierta 13 de 13 en la
 * prueba mas dura que se le pudo montar, pero un cruce entre dos zonas sale
 * impreso en el reporte y no lo nota nadie: son doce fotos parecidas de la
 * misma tienda. Que alguien diga «va» cuesta un mensaje y es la unica defensa.
 *
 * Reconocer solo RENOMBRA archivos. Todo lo de despues --armar el .pptx-- sigue
 * siendo exactamente el mismo camino de siempre.
 */

type Guardada = { creada: string; asignaciones: Asignacion[] };

function leerPropuesta(): Guardada | null {
  if (!existsSync(PROPUESTA)) return null;
  try {
    const dato = JSON.parse(readFileSync(PROPUESTA, "utf8")) as Guardada;
    return Array.isArray(dato.asignaciones) ? dato : null;
  } catch {
    return null;
  }
}

function guardarPropuesta(asignaciones: Asignacion[]): void {
  writeFileSync(PROPUESTA, JSON.stringify({ creada: new Date().toISOString(), asignaciones }, null, 2), "utf8");
}

/** El texto que enseña el bot. Se arma aqui para que n8n no formatee nada. */
function mensajeDe(asignaciones: Asignacion[]): string {
  const lineas = asignaciones.map((a, i) => `${String(i + 1).padStart(2)}. ${a.etiqueta}${a.porque ? ` — ${a.porque}` : ""}`);
  return [
    "Asi las acomodaria:",
    "",
    ...lineas,
    "",
    "Si esta bien:  visual confirmar",
    "Si algo falla: visual cambiar 3 = MSW ZONA 1"
  ].join("\n");
}

async function etiquetasDePlantilla(): Promise<string[] | null> {
  if (!existsSync(PLANTILLA)) return null;
  const huecos = await leerHuecos(await JSZip.loadAsync(readFileSync(PLANTILLA)));
  return huecos.map((h) => h.etiqueta);
}

export async function GET(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  if (!reconocerConfigurado()) {
    return NextResponse.json({ error: "El reconocimiento no esta configurado en el servidor." }, { status: 503 });
  }

  const etiquetas = await etiquetasDePlantilla();
  if (!etiquetas) return NextResponse.json({ error: `No hay plantilla en ${PLANTILLA}.` }, { status: 404 });

  const anonimas = leerPendientes().filter(esSinNombre);
  if (anonimas.length === 0) {
    return NextResponse.json({ error: "No hay ninguna foto sin nombre que reconocer." }, { status: 422 });
  }

  /*
   * Las zonas que YA tienen su foto con pie salen del reparto: su hueco esta
   * ocupado. Repartir sobre zonas tomadas mandaria una foto a un sitio que ya
   * tiene dueño, y la restriccion de uno a uno --que es lo que hace que esto
   * funcione-- dejaria de valer.
   */
  const conPie = new Set(leerPendientes().filter((f) => !esSinNombre(f)).map((f) => plano(etiquetaDe(f))));
  const libres = etiquetas.filter((e) => !conPie.has(plano(e)));

  const referencias = leerReferencias(libres);
  if (referencias.length === 0) {
    return NextResponse.json(
      {
        error:
          "Todavia no hay referencias. Arma un reporte con las fotos nombradas a mano y a partir de la semana siguiente ya se reconocen solas."
      },
      { status: 422 }
    );
  }
  if (referencias.length < anonimas.length) {
    return NextResponse.json(
      {
        error: `Hay ${anonimas.length} fotos sin nombre y solo ${referencias.length} zonas con referencia. Ponle pie a las que sobran.`,
        zonasConReferencia: referencias.map((r) => r.etiqueta)
      },
      { status: 422 }
    );
  }

  const fotos: FotoAnonima[] = [];
  for (const archivo of anonimas) {
    fotos.push({ archivo, contenido: await encoger(readFileSync(join(PENDIENTES, archivo))) });
  }

  const respuesta = await repartirConBedrock(construirPrompt(referencias, fotos), referencias, fotos);
  if (!respuesta.ok) {
    return NextResponse.json({ error: `No se pudo reconocer (${respuesta.problem}).` }, { status: 502 });
  }

  const reparto = interpretarReparto(respuesta.text, fotos, referencias.map((r) => r.etiqueta));
  if (!reparto.ok) {
    console.warn(`[visual-reconocer] reparto rechazado: ${reparto.error}`);
    return NextResponse.json({ error: `El reparto no cuadra: ${reparto.error}` }, { status: 422 });
  }

  guardarPropuesta(reparto.asignaciones);
  return NextResponse.json({
    ok: true,
    asignaciones: reparto.asignaciones,
    mensaje: mensajeDe(reparto.asignaciones)
  });
}

export async function POST(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const accion = (url.searchParams.get("accion") ?? "").trim().toLowerCase();

  const guardada = leerPropuesta();
  if (!guardada) {
    return NextResponse.json({ error: "No hay ninguna propuesta. Manda «visual reconocer» primero." }, { status: 422 });
  }

  const etiquetas = await etiquetasDePlantilla();
  if (!etiquetas) return NextResponse.json({ error: `No hay plantilla en ${PLANTILLA}.` }, { status: 404 });

  if (accion === "cambiar") {
    const numero = Number(url.searchParams.get("foto"));
    const etiqueta = (url.searchParams.get("etiqueta") ?? "").trim();
    if (!Number.isInteger(numero) || numero < 1 || numero > guardada.asignaciones.length) {
      return NextResponse.json({ error: `La foto ${url.searchParams.get("foto")} no esta en la propuesta.` }, { status: 400 });
    }
    const cambiado = cambiarZona(guardada.asignaciones, guardada.asignaciones[numero - 1].archivo, etiqueta, etiquetas);
    if (!cambiado.ok) return NextResponse.json({ error: cambiado.error }, { status: 400 });

    guardarPropuesta(cambiado.asignaciones);
    return NextResponse.json({ ok: true, asignaciones: cambiado.asignaciones, mensaje: mensajeDe(cambiado.asignaciones) });
  }

  if (accion !== "aplicar") {
    return NextResponse.json({ error: "Acciones validas: aplicar, cambiar." }, { status: 400 });
  }

  /*
   * ⚠️ Se comprueba que las fotos SIGAN estando antes de renombrar ninguna.
   * Entre proponer y confirmar pudo armarse un reporte, o pudo llegar otra
   * foto. Renombrar la mitad dejaria el reparto roto sin decirlo.
   */
  const enDisco = new Set(leerPendientes());
  const perdidas = guardada.asignaciones.filter((a) => !enDisco.has(a.archivo));
  if (perdidas.length > 0) {
    return NextResponse.json(
      { error: `Ya no estan ${perdidas.length} de las fotos de la propuesta. Manda «visual reconocer» otra vez.` },
      { status: 409 }
    );
  }

  const renombradas: string[] = [];
  for (const a of guardada.asignaciones) {
    const destino = join(PENDIENTES, `${a.etiqueta}${extname(a.archivo)}`);
    renameSync(join(PENDIENTES, a.archivo), destino);
    renombradas.push(a.etiqueta);
  }
  unlinkSync(PROPUESTA);

  return NextResponse.json({
    ok: true,
    renombradas,
    mensaje: `Listo, ${renombradas.length} foto(s) con su zona.\n\nYa puedes mandar «visual armar».`
  });
}
