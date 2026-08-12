import { Database } from "lucide-react";

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
          <Database size={26} />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink">Estamos mejorando Clarvex</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Estamos montando nuestra propia base de datos. A partir de ahora la información de la
          tienda se captura y se guarda aquí mismo, sin depender de archivos de Excel externos.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted">
          Es un cambio grande y por eso la app está cerrada mientras lo hacemos. Ganamos que los
          números dejen de llegar tarde o de fallar cuando alguien mueve un archivo.
        </p>
        <p className="mt-4 rounded-2xl bg-white/5 px-4 py-3 text-sm leading-6 text-ink">
          Tu información está a salvo. No se pierde nada de lo que hayas registrado.
        </p>
        <p className="mt-4 text-xs leading-5 text-muted">
          Te avisamos por notificación en cuanto vuelva a estar disponible. Si necesitas algo
          urgente mientras tanto, habla con tu gerente.
        </p>
      </div>
    </main>
  );
}
