"use client";

import { useEffect, useState } from "react";
import { Link2, RefreshCw, Unplug, Wifi } from "lucide-react";
import { Button, Card } from "@/components/ui";

type PowerBiStatus = {
  configuredOnServer: boolean;
  connected: boolean;
  accountEmail: string | null;
  connectedAt: string | null;
  exportUrl: string;
};

type PowerBiConnectionCardProps = {
  onMessage?: (message: string) => void;
  className?: string;
};

function formatConnectedAt(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

export function PowerBiConnectionCard({ onMessage, className }: PowerBiConnectionCardProps) {
  const [status, setStatus] = useState<PowerBiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function fetchStatus() {
    setLoading(true);
    try {
      const response = await fetch("/api/integrations/power-bi/status", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo consultar Power BI.");
      const payload = await response.json() as { status: PowerBiStatus };
      setStatus(payload.status);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchStatus();

    const params = new URLSearchParams(window.location.search);
    const result = params.get("powerbi");
    if (result === "connected") {
      onMessage?.("Power BI conectado correctamente con Microsoft.");
    } else if (result === "error") {
      const reason = params.get("reason");
      onMessage?.(
        reason
          ? `No se pudo conectar Power BI: ${decodeURIComponent(reason)}`
          : "No se pudo conectar Power BI."
      );
    }
    // Solo al montar: leer ?powerbi= de la URL tras el callback OAuth.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onMessage estable desde el padre
  }, []);

  async function connect() {
    setConnecting(true);
    onMessage?.("");
    try {
      const response = await fetch("/api/integrations/power-bi/connect", { cache: "no-store" });
      const payload = await response.json() as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "No se pudo iniciar login con Microsoft.");
      }
      window.location.href = payload.url;
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "No se pudo conectar Power BI.");
      setConnecting(false);
    }
  }

  async function testExport() {
    setTesting(true);
    onMessage?.("Probando exportación de Power BI...");
    try {
      const response = await fetch("/api/integrations/power-bi/test", { method: "POST" });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "La prueba de Power BI falló.");
      onMessage?.(payload.message ?? "Power BI respondió correctamente.");
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "La prueba de Power BI falló.");
    } finally {
      setTesting(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    onMessage?.("");
    try {
      const response = await fetch("/api/integrations/power-bi/disconnect", { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "No se pudo desconectar Power BI.");
      }
      await fetchStatus();
      onMessage?.("Power BI desconectado.");
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "No se pudo desconectar Power BI.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card className={`border-volt/20 p-4 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-volt">Experimental</p>
          <h3 className="mt-1 text-lg font-black tracking-[-0.02em] text-ink">Power BI en vivo</h3>
          <p className="mt-1 text-[12px] leading-5 text-muted">
            Conecta tu cuenta Microsoft para exportar ventas del día sin copiar tokens desde DevTools.
          </p>
          {loading ? (
            <p className="mt-2 text-[12px] text-muted">Consultando estado...</p>
          ) : status?.connected ? (
            <div className="mt-2 space-y-1 text-[12px]">
              <p className="font-semibold text-ink">
                Conectado {status.accountEmail ? `como ${status.accountEmail}` : "con Microsoft"}
              </p>
              <p className="text-muted">Desde {formatConnectedAt(status.connectedAt)}</p>
            </div>
          ) : status?.configuredOnServer ? (
            <p className="mt-2 text-[12px] font-semibold text-amber-700 dark:text-amber-300">Sin conectar</p>
          ) : (
            <p className="mt-2 text-[12px] font-semibold text-amber-700 dark:text-amber-300">
              OAuth no configurado en el servidor
            </p>
          )}
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-[16px] border border-line bg-blue-50 text-volt dark:bg-blue-950/40">
          <Wifi size={18} />
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!status?.connected ? (
          <Button
            type="button"
            variant="primary"
            icon={<Link2 size={16} />}
            disabled={connecting || !status?.configuredOnServer}
            onClick={() => void connect()}
          >
            {connecting ? "Redirigiendo..." : "Conectar con Microsoft"}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="glass"
              icon={<RefreshCw size={16} />}
              disabled={testing}
              onClick={() => void testExport()}
            >
              {testing ? "Probando..." : "Probar exportación"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              icon={<Unplug size={16} />}
              disabled={disconnecting}
              onClick={() => void disconnect()}
            >
              Desconectar
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
