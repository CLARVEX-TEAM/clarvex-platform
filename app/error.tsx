"use client";

// Límite de error global: un crash de render ya no deja la pantalla en blanco.
// Muestra qué pasó (digest para rastrearlo en logs) y permite reintentar.

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-panel px-8 text-center">
      <div className="max-w-sm">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-3xl bg-orchid/10 text-2xl">⚠️</span>
        <h1 className="text-lg font-semibold text-ink dark:text-white">Algo salió mal</h1>
        <p className="mt-1.5 text-sm font-semibold text-muted">
          Ocurrió un error al cargar esta pantalla. Intenta de nuevo; si sigue pasando, avisa a soporte con el código de abajo.
        </p>
        {error.digest && (
          <p className="mt-2 text-[11px] font-bold tracking-wider text-muted">Código: {error.digest}</p>
        )}
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-volt px-6 py-2.5 text-sm font-semibold text-white transition active:scale-95"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={() => { window.location.href = "/"; }}
            className="rounded-full border border-line px-6 py-2.5 text-sm font-semibold text-muted transition active:scale-95"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    </main>
  );
}
