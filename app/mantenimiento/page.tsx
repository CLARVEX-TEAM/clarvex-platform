import { Wrench } from "lucide-react";

// Página de la ventana de mantenimiento (MAINTENANCE_MODE=1). El middleware
// hace rewrite aquí con status 503, así que la URL del usuario no cambia y le
// basta con recargar cuando termine.
//
// Deliberadamente es un Server Component sin estado ni sesión: tiene que
// renderizar aunque la base de datos esté caída, que es cuando más se necesita.
export const dynamic = "force-static";

export const metadata = {
  title: "En mantenimiento — Clarvex Team"
};

export default function MaintenancePage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-md place-items-center px-4">
      <div className="w-full rounded-[24px] border border-white/10 bg-white/5 p-6 text-center backdrop-blur">
        <span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-ember/10 text-ember">
          <Wrench size={26} />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink">Estamos en mantenimiento</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Estamos aplicando una actualización. Vuelve en unos minutos: tus datos están a salvo y no
          se pierde nada de lo que hayas registrado.
        </p>
        <p className="mt-4 text-xs text-muted">
          Si esto sigue así en un rato, avísale a tu gerente.
        </p>
      </div>
    </main>
  );
}
