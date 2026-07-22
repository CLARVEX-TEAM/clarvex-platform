import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LEGAL_CONTENT } from "@/lib/legal-content";

// Renderiza un documento legal (texto aprobado por el área legal) a partir de su
// clave en LEGAL_CONTENT. Encabezados y párrafos con tipografía legible.
export function LegalDocument({ docKey, backHref = "/login" }: { docKey: string; backHref?: string }) {
  const doc = LEGAL_CONTENT[docKey];
  if (!doc) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-8">
        <p className="text-sm font-semibold text-muted">Documento no disponible.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <Link href={backHref} className="mb-6 inline-flex items-center gap-1.5 text-sm font-bold text-volt">
        <ArrowLeft size={16} /> Volver
      </Link>
      <article className="text-[15px] leading-7 text-ink">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{doc.title}</h1>
        {doc.updated ? <p className="mt-1 text-sm font-semibold text-muted">{doc.updated}</p> : null}
        <div className="mt-5 space-y-3">
          {doc.blocks.map((block, i) =>
            block.t === "h" ? (
              <h2 key={i} className="pt-3 text-lg font-semibold text-ink">{block.x}</h2>
            ) : (
              <p key={i} className="text-muted">{block.x}</p>
            )
          )}
        </div>
      </article>
    </main>
  );
}
