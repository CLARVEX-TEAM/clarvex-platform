"use client";

// Límite de error global: un crash de render ya no deja la pantalla en blanco.
// Muestra qué pasó (digest para rastrearlo en logs) y permite reintentar.

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-8 text-center dark:bg-slate-950">
      <div className="max-w-sm">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-3xl bg-rose-500/10 text-2xl">⚠️</span>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Algo salió mal</h1>
        <p className="mt-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Ocurrió un error al cargar esta pantalla. Intenta de nuevo; si sigue pasando, avisa a soporte con el código de abajo.
        </p>
        {error.digest && (
          <p className="mt-2 text-[11px] font-bold tracking-wider text-slate-400">Código: {error.digest}</p>
        )}
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition active:scale-95"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={() => { window.location.href = "/"; }}
            className="rounded-full border border-slate-300 px-6 py-2.5 text-sm font-semibold text-slate-600 transition active:scale-95 dark:border-slate-700 dark:text-slate-300"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    </main>
  );
}
