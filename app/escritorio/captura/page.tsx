"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

/**
 * Captura de horarios y asistencia, incrustada desde Retool.
 *
 * La URL se pide al servidor en cada carga y es de UN SOLO USO: no se guarda ni
 * se comparte. Quién eres y de qué tienda sale de tu sesión de Clarvex, así que
 * la pantalla solo puede capturar tu tienda — no hay parámetro que cambiar.
 */
export default function CapturaPage() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUrl(null);
    try {
      const response = await fetch("/api/retool/embed-url", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !payload?.url) {
        setError(payload?.error ?? `No se pudo abrir la captura (${response.status}).`);
        return;
      }
      setUrl(payload.url);
    } catch {
      setError("No hay conexión con el servidor. Revisa tu red e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Captura de horarios y asistencia de tu tienda.
        </p>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-ink transition hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : undefined} />
          Recargar
        </button>
      </div>

      {loading ? (
        <div className="grid flex-1 place-items-center rounded-[24px] border border-white/10 bg-white/5">
          <div className="flex items-center gap-3 text-sm text-muted">
            <Loader2 size={18} className="animate-spin" />
            Abriendo la captura…
          </div>
        </div>
      ) : error ? (
        <div className="grid flex-1 place-items-center rounded-[24px] border border-white/10 bg-white/5 px-6">
          <div className="max-w-md text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-ember/10 text-ember">
              <AlertCircle size={22} />
            </span>
            <h2 className="mt-3 text-base font-semibold text-ink">No se pudo abrir la captura</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{error}</p>
            <button
              type="button"
              onClick={() => void cargar()}
              className="mt-4 rounded-xl bg-white/10 px-4 py-2 text-sm text-ink transition hover:bg-white/15"
            >
              Intentar de nuevo
            </button>
          </div>
        </div>
      ) : url ? (
        <iframe
          src={url}
          title="Captura de tienda"
          className="flex-1 rounded-[24px] border border-white/10 bg-white"
          // El iframe carga una app de Retool que necesita ejecutar scripts y
          // hablar con su propio origen. No se le concede acceso al nuestro.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        />
      ) : null}
    </div>
  );
}
