import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Política de Uso Aceptable · CLARVEX Team",
  description: "Política de uso aceptable de CLARVEX Team."
};

// NOTA PARA EL RESPONSABLE: pega aquí el texto FINAL de la Política de Uso
// Aceptable revisado por tu abogado. Mientras tanto queda esta versión breve.
export default function UsoAceptablePage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <Link href="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm font-bold text-volt">
        <ArrowLeft size={16} /> Volver
      </Link>

      <article className="space-y-5 text-[15px] leading-7 text-ink">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Política de Uso Aceptable</h1>
          <p className="text-sm font-semibold text-muted">CLARVEX Team</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">1. Uso permitido</h2>
          <p>
            La plataforma se utiliza de forma lícita, diligente y de buena fe, exclusivamente para la operación
            de la tienda y conforme a la relación laboral vigente.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">2. Conductas prohibidas</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>Compartir credenciales o el acceso con terceros no autorizados.</li>
            <li>Extraer, copiar o difundir información fuera de la organización.</li>
            <li>Intentar vulnerar la seguridad de la plataforma o introducir código malicioso.</li>
            <li>Usar la plataforma para fines ilícitos o ajenos a la operación de la tienda.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">3. Consecuencias</h2>
          <p>
            El incumplimiento puede dar lugar a la suspensión o cancelación del acceso, sin perjuicio de las
            acciones que correspondan. Esta política complementa los{" "}
            <Link href="/terminos" className="font-bold text-volt underline-offset-2 hover:underline">Términos de Uso</Link>.
          </p>
        </section>

        <p className="pt-2 text-sm font-semibold text-muted">Última actualización: [pendiente de texto final].</p>
      </article>
    </main>
  );
}
