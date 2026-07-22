import Link from "next/link";
import { ArrowLeft, FileText, ChevronRight } from "lucide-react";

export const metadata = {
  title: "Avisos legales · CLARVEX Team",
  description: "Documentos legales de CLARVEX Team."
};

const DOCS = [
  { href: "/terminos", label: "Términos de Uso", note: "Para el usuario final" },
  { href: "/privacidad", label: "Aviso de Privacidad", note: "Tratamiento de tus datos" },
  { href: "/uso-aceptable", label: "Política de Uso Aceptable", note: "Conductas permitidas y prohibidas" },
  { href: "/politica-privacidad", label: "Política de Privacidad", note: "Detalle del tratamiento de datos" },
  { href: "/cookies", label: "Política de Cookies", note: "Cookies y almacenamiento local" },
  { href: "/reembolsos", label: "Política de Reembolsos y Cancelaciones", note: "Aplica al cliente que contrata" },
  { href: "/seguridad", label: "Política de Seguridad de la Información", note: "Medidas de seguridad" }
];

export default function LegalIndexPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <Link href="/perfil" className="mb-6 inline-flex items-center gap-1.5 text-sm font-bold text-volt">
        <ArrowLeft size={16} /> Volver
      </Link>
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Avisos legales</h1>
      <p className="mt-1 text-sm text-muted">Documentos legales de CLARVEX Team.</p>

      <ul className="mt-5 grid gap-2">
        {DOCS.map((doc) => (
          <li key={doc.href}>
            <Link
              href={doc.href}
              className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 transition hover:border-volt/40"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-volt/12 text-volt"><FileText size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{doc.label}</span>
                <span className="block text-xs text-muted">{doc.note}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
