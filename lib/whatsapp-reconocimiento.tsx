import React from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { firstName } from "@/lib/weekly-close";
import { pesos } from "@/lib/whatsapp-formato";
import { ALTO, ANCHO, C, cargarRecursos } from "@/lib/whatsapp-tarjeta";

/**
 * Reconocimientos de Tailored Help, con la foto recortada de la persona.
 *
 * Tres motivos, los que pidió Adrián: el primer donativo de la campaña, un día
 * de $150 o más y el MVP de la semana. Las cifras las dibuja el código.
 */

export type TipoReconocimiento = "primero" | "dia" | "mvp";

const TEXTOS: Record<TipoReconocimiento, { chip: string; titulo: string; caja: string }> = {
  primero: { chip: "PRIMER DONATIVO", titulo: "¡Abrió la campaña!", caja: "DONATIVO" },
  dia: { chip: "GRAN DÍA", titulo: "¡Día de donativos!", caja: "EN EL DÍA" },
  mvp: { chip: "MVP DE LA SEMANA", titulo: "¡MVP de la semana!", caja: "EN LA SEMANA" }
};

/** Clave de la foto: el primer nombre como se usa en tienda, sin acentos. */
export function claveDeFoto(nombre: string): string {
  return firstName(nombre).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Foto recortada en `lib/assets/equipo/<clave>.png`; sin ella, iniciales. */
async function fotoDe(nombre: string): Promise<string | null> {
  try {
    const png = await readFile(path.join(process.cwd(), "lib/assets/equipo", `${claveDeFoto(nombre)}.png`));
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export function motivoDe(tipo: TipoReconocimiento, monto: number): string {
  if (tipo === "primero") return "Consiguió el primer donativo de la campaña en la tienda.";
  if (tipo === "dia") return `Juntó ${pesos(monto)} en un solo día.`;
  return "Fue quien más donativos juntó esta semana.";
}

export async function tarjetaReconocimiento(opciones: {
  tipo: TipoReconocimiento;
  nombre: string;
  tienda: string;
  monto: number;
  donativos: number;
  /** «Sábado 7 de noviembre» o «Semana 45». */
  cuando: string;
}): Promise<Buffer> {
  const SALVIA = "#5F7464";
  const SALVIA_CLARO = "#E6EDE6";
  const CREMA = "#FBF8F2";
  const ORO = "#E9C46A";
  const { fuentes, logo, logoCampana } = await cargarRecursos();
  const foto = await fotoDe(opciones.nombre);
  const t = TEXTOS[opciones.tipo];
  const iniciales = opciones.nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  const arco = "300px 300px 48px 48px";

  const caja = (titulo: string, valor: string) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 40px", borderRadius: 28, background: "#FFFFFF" }}>
      <span style={{ fontSize: 20, color: C.tenue, fontWeight: 600, letterSpacing: 1.5 }}>{titulo}</span>
      <span style={{ fontSize: 46, fontWeight: 700, color: SALVIA }}>{valor}</span>
    </div>
  );

  const nodo = (
    <div style={{ display: "flex", flexDirection: "column", width: ANCHO, height: ALTO, background: CREMA, fontFamily: "Geist", color: C.tinta, padding: "56px 64px 48px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- motor de imagen, no una página */}
        <img src={logoCampana} width={380} height={110} alt="" />
        <span style={{ fontSize: 24, fontWeight: 600, padding: "12px 24px", borderRadius: 999, background: SALVIA_CLARO, color: SALVIA }}>{opciones.cuando}</span>
      </div>

      {/* Arco salvia con la persona saliendo de él */}
      <div style={{ display: "flex", position: "relative", justifyContent: "center", marginTop: 30, height: 600 }}>
        <div style={{ display: "flex", position: "absolute", bottom: 0, left: 176, width: 600, height: 500, borderRadius: arco, background: SALVIA }} />
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: 0,
            left: 176,
            width: 600,
            height: 500,
            borderRadius: arco,
            backgroundImage: "radial-gradient(circle at 50% 25%, rgba(255,255,255,0.25), rgba(255,255,255,0) 65%)"
          }}
        />
        {foto ? (
          <div style={{ display: "flex", position: "absolute", bottom: 0, left: 126, width: 700, height: 600, justifyContent: "center", alignItems: "flex-end", overflow: "hidden", borderRadius: "0 0 48px 48px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- motor de imagen, no una página */}
            <img src={foto} alt="" style={{ height: 600, objectFit: "contain" }} />
          </div>
        ) : (
          <div style={{ display: "flex", position: "absolute", bottom: 130, left: 176, width: 600, justifyContent: "center" }}>
            <span style={{ fontSize: 200, fontWeight: 700, color: "#FFFFFF", letterSpacing: -6 }}>{iniciales}</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: -30 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 32px",
            borderRadius: 999,
            background: ORO,
            color: "#4A3B10",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: 1,
            boxShadow: "0 8px 24px rgba(74,59,16,0.18)"
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24">
            <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z" fill="#4A3B10" />
          </svg>
          {t.chip}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 26 }}>
        <span style={{ fontSize: 30, fontWeight: 600, color: SALVIA }}>{t.titulo}</span>
        <span style={{ fontSize: 104, fontWeight: 700, letterSpacing: -4, lineHeight: 1.05, marginTop: 2 }}>{firstName(opciones.nombre)}</span>
        <span style={{ fontSize: 28, color: C.suave, marginTop: 8, textAlign: "center" }}>{motivoDe(opciones.tipo, opciones.monto)}</span>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 24 }}>
        {caja(t.caja, pesos(opciones.monto))}
        {opciones.donativos > 1 ? caja("DONATIVOS", String(opciones.donativos)) : null}
      </div>

      <div style={{ display: "flex", marginTop: "auto", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 22, color: C.suave }}>{`${opciones.tienda} · para Christel House México`}</span>
        {/* eslint-disable-next-line @next/next/no-img-element -- motor de imagen, no una página */}
        <img src={logo} width={176} height={44} alt="" />
      </div>
    </div>
  );
  const respuesta = new ImageResponse(nodo, { width: ANCHO, height: ALTO, fonts: fuentes });
  return Buffer.from(await respuesta.arrayBuffer());
}
