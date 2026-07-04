import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Términos de Uso · CLARVEX Team",
  description: "Términos de uso de CLARVEX Team."
};

// NOTA PARA EL RESPONSABLE: base de términos de uso para una herramienta
// interna. Complete los datos entre [corchetes] y revíselo con su área legal.
export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <Link href="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm font-bold text-volt">
        <ArrowLeft size={16} /> Volver
      </Link>

      <article className="space-y-5 text-[15px] leading-7 text-ink">
        <header className="space-y-1">
          <h1 className="text-2xl font-black tracking-[-0.02em]">Términos de Uso</h1>
          <p className="text-sm font-semibold text-muted">CLARVEX Team</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-black">1. Naturaleza de la herramienta</h2>
          <p>
            CLARVEX Team es una aplicación de uso interno provista por CLARVEX, representada por su representante
            legal Jesús Adrián Hernández Luna, para la gestión operativa de sus tiendas. El acceso se otorga
            exclusivamente a personal autorizado y está ligado a la relación laboral vigente.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black">2. Uso de la cuenta</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>Su PIN y su acceso biométrico son personales e intransferibles.</li>
            <li>Usted es responsable de la actividad realizada desde su cuenta.</li>
            <li>Debe reportar de inmediato cualquier uso no autorizado a su gerencia.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black">3. Uso aceptable</h2>
          <p>
            La información mostrada (ventas, metas, comisiones, datos del equipo) es confidencial y de uso
            estrictamente laboral. Queda prohibido compartirla fuera de la organización, así como usar la
            aplicación para fines distintos a la operación de la tienda.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black">4. Disponibilidad</h2>
          <p>
            El servicio se ofrece “tal cual”. El Responsable procura su disponibilidad continua, pero puede
            realizar mantenimientos o suspender el acceso cuando concluya la relación laboral o por motivos de
            seguridad.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black">5. Datos personales</h2>
          <p>
            El tratamiento de datos personales se rige por el{" "}
            <Link href="/privacidad" className="font-bold text-volt underline-offset-2 hover:underline">Aviso de Privacidad</Link>.
          </p>
        </section>

        <p className="pt-2 text-sm font-semibold text-muted">Última actualización: 4 de julio de 2026.</p>
      </article>
    </main>
  );
}
