"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { getSession } from "@/lib/auth";
import { tagQrPayload, type CycleZone, type SerializedTag } from "@/lib/cycle-count";

// Hoja imprimible de marbetes QR. Los de piso van chicos (~2 cm) para pegarse
// discretos en el mueble; los de bodega pueden ir más grandes.

type TagWithQr = SerializedTag & { svg: string };

export default function ImprimirMarbetesPage() {
  const router = useRouter();
  const [tags, setTags] = useState<TagWithQr[] | null>(null);
  const [zone, setZone] = useState<CycleZone | "TODOS">("TODOS");
  const [size, setSize] = useState<"chico" | "mediano">("chico");
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    getSession().then(async (session) => {
      if (!session) { router.replace("/login"); return; }
      if (session.role === "ASESOR") { router.replace("/conteos"); return; }
      const res = await fetch("/api/conteos/tags", { cache: "no-store" });
      const data = (await res.json()) as { tags?: SerializedTag[] };
      const active = (data.tags ?? []).filter((tag) => tag.active);
      const withQr = await Promise.all(active.map(async (tag) => ({
        ...tag,
        svg: await QRCode.toString(tagQrPayload(tag.number), { type: "svg", margin: 0, errorCorrectionLevel: "M" })
      })));
      setTags(withQr);
    /* ⚠️ Sin este `catch`, un fallo de red dejaba la pantalla en «Generando
       códigos…» para siempre: ni mensaje, ni forma de reintentar, y encima
       esta es la vista que alguien abre justo antes de ir a imprimir. */
    }).catch(() => setFallo(true));
  }, [router]);

  const visible = (tags ?? []).filter((tag) => zone === "TODOS" || tag.zone === zone);
  const sizePx = size === "chico" ? 68 : 100;

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900">
      {/* Controles (no salen en la impresión) */}
      <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
        <button type="button" onClick={() => router.back()} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold">← Regresar</button>
        <select value={zone} onChange={(e) => setZone(e.target.value as CycleZone | "TODOS")} aria-label="Zona" className="rounded-full border border-slate-300 px-3 py-2 text-sm font-bold">
          <option value="TODOS">Piso y bodega</option>
          <option value="PISO">Solo piso de venta</option>
          <option value="BODEGA">Solo bodega</option>
        </select>
        <select value={size} onChange={(e) => setSize(e.target.value as "chico" | "mediano")} aria-label="Tamaño" className="rounded-full border border-slate-300 px-3 py-2 text-sm font-bold">
          <option value="chico">Chico (~2 cm, piso)</option>
          <option value="mediano">Mediano (~3 cm, bodega)</option>
        </select>
        <button type="button" onClick={() => window.print()} className="ml-auto flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white">
          <Printer size={15} /> Imprimir
        </button>
        <p className="w-full text-xs text-slate-500">
          Imprime en hoja adhesiva, recorta y pega cada QR en su mueble/rack. El número va impreso junto al código por si falla la cámara.
        </p>
      </div>

      {fallo ? (
        <div className="py-10 text-center">
          <p className="text-sm font-bold text-slate-900">No se pudieron cargar los marbetes</p>
          <p className="mt-1 text-sm text-slate-500">Puede ser la señal. Vuelve a abrir esta pantalla.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-full border border-slate-300 px-4 py-2 text-sm font-bold">Reintentar</button>
        </div>
      ) : tags === null ? (
        <p className="py-10 text-center text-sm font-bold text-slate-400">Generando códigos…</p>
      ) : (
        <div className="flex flex-wrap gap-3 print:gap-2">
          {visible.map((tag) => (
            <div key={tag.id} className="flex flex-col items-center rounded-sm border border-dashed border-slate-300 p-1.5" style={{ breakInside: "avoid" }}>
              <div style={{ width: sizePx, height: sizePx }} dangerouslySetInnerHTML={{ __html: tag.svg }} />
              <span className="mt-0.5 text-[10px] font-semibold leading-none">
                {tag.zone === "PISO" ? "P" : "B"}-{tag.number}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
