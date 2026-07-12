"use client";

import { useEffect, useState } from "react";
import { ClipboardPaste, Download, Link2, RefreshCw, Terminal, Unplug, Wifi } from "lucide-react";
import { Button, Card } from "@/components/ui";

type PowerBiAuthMode = "OAUTH" | "DEVTOOLS";

type PowerBiStatus = {
  configuredOnServer: boolean;
  devToolsAvailable: boolean;
  connected: boolean;
  authMode: PowerBiAuthMode | null;
  accountEmail: string | null;
  connectedAt: string | null;
  exportUrl: string;
  accessTokenExpiresAt: string | null;
  accessTokenExpired: boolean;
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
  const [showDevTools, setShowDevTools] = useState(false);
  const [fetchSource, setFetchSource] = useState("");
  const [savingDevTools, setSavingDevTools] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function fetchStatus() {
    setLoading(true);
    try {
      const response = await fetch("/api/integrations/power-bi/status", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo consultar Power BI.");
      const payload = await response.json() as { status: PowerBiStatus };
      setStatus(payload.status);
      if (payload.status.authMode === "DEVTOOLS" || !payload.status.configuredOnServer) {
        setShowDevTools(true);
      }
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

  async function saveDevToolsToken() {
    if (!fetchSource.trim()) {
      onMessage?.("Pega el fetch copiado desde DevTools.");
      return;
    }

    setSavingDevTools(true);
    onMessage?.("Guardando token y probando exportación...");
    try {
      const response = await fetch("/api/integrations/power-bi/devtools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fetchSource })
      });
      const payload = await response.json() as {
        message?: string;
        error?: string;
        status?: PowerBiStatus;
      };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar el token.");
      if (payload.status) setStatus(payload.status);
      setFetchSource("");
      onMessage?.(payload.message ?? "Token de DevTools guardado.");
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "No se pudo guardar el token.");
    } finally {
      setSavingDevTools(false);
    }
  }

  async function syncKpis() {
    setSyncing(true);
    onMessage?.("Exportando Power BI y sincronizando KPIs de hoy...");
    try {
      const response = await fetch("/api/integrations/power-bi/sync", { method: "POST" });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo sincronizar KPIs desde Power BI.");
      onMessage?.(payload.message ?? "KPIs sincronizados desde Power BI.");
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "No se pudo sincronizar KPIs desde Power BI.");
    } finally {
      setSyncing(false);
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

  const connectedViaOAuth = status?.connected && status.authMode === "OAUTH";
  const connectedViaDevTools = status?.connected && status.authMode === "DEVTOOLS";

  return (
    <Card className={`border-volt/20 p-4 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-volt">Puente temporal</p>
          <h3 className="mt-1 text-lg font-black tracking-[-0.02em] text-ink">Power BI en vivo</h3>
          <p className="mt-1 text-[12px] leading-5 text-muted">
            Opcional: rellena KPIs del día mientras el RDV no esté actualizado. El RDV cada hora no pisa los datos de hoy importados aquí.
          </p>
          {loading ? (
            <p className="mt-2 text-[12px] text-muted">Consultando estado...</p>
          ) : status?.connected ? (
            <div className="mt-2 space-y-1 text-[12px]">
              <p className="font-semibold text-ink">
                {connectedViaDevTools ? "Token DevTools activo" : "Conectado con Microsoft"}
                {status.accountEmail ? ` · ${status.accountEmail}` : ""}
              </p>
              <p className="text-muted">Desde {formatConnectedAt(status.connectedAt)}</p>
              {connectedViaDevTools && status.accessTokenExpiresAt ? (
                <p className={status.accessTokenExpired ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted"}>
                  {status.accessTokenExpired
                    ? "Token expirado — pega un fetch nuevo"
                    : `Expira ${formatConnectedAt(status.accessTokenExpiresAt)}`}
                </p>
              ) : null}
            </div>
          ) : status?.configuredOnServer || status?.devToolsAvailable ? (
            <p className="mt-2 text-[12px] font-semibold text-amber-700 dark:text-amber-300">Sin conectar</p>
          ) : (
            <p className="mt-2 text-[12px] font-semibold text-amber-700 dark:text-amber-300">
              Falta POWER_BI_TOKEN_ENCRYPTION_KEY en el servidor
            </p>
          )}
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-[16px] border border-line bg-blue-50 text-volt dark:bg-blue-950/40">
          <Wifi size={18} />
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {status?.connected ? (
          <>
            <Button
              type="button"
              variant="primary"
              icon={<Download size={16} />}
              disabled={syncing || (connectedViaDevTools && status.accessTokenExpired)}
              onClick={() => void syncKpis()}
            >
              {syncing ? "Sincronizando..." : "Sincronizar KPIs hoy"}
            </Button>
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
            {connectedViaDevTools ? (
              <Button
                type="button"
                variant="ghost"
                icon={<ClipboardPaste size={16} />}
                onClick={() => setShowDevTools(true)}
              >
                Actualizar token
              </Button>
            ) : null}
          </>
        ) : (
          <>
            {status?.configuredOnServer ? (
              <Button
                type="button"
                variant="primary"
                icon={<Link2 size={16} />}
                disabled={connecting}
                onClick={() => void connect()}
              >
                {connecting ? "Redirigiendo..." : "Conectar con Microsoft"}
              </Button>
            ) : null}
            {status?.devToolsAvailable ? (
              <Button
                type="button"
                variant={status.configuredOnServer ? "glass" : "primary"}
                icon={<Terminal size={16} />}
                onClick={() => setShowDevTools((value) => !value)}
              >
                {showDevTools ? "Ocultar DevTools" : "Pegar token DevTools"}
              </Button>
            ) : null}
          </>
        )}
      </div>

      {showDevTools && status?.devToolsAvailable ? (
        <div className="mt-4 space-y-3 rounded-[16px] border border-line bg-surface/60 p-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Token desde DevTools</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-[12px] leading-5 text-muted">
              <li>En Power BI abre el reporte y exporta el visual a Excel.</li>
              <li>DevTools → Network → petición <code className="text-ink">export/xlsx</code> → clic derecho → Copy as fetch.</li>
              <li>Pega aquí el bloque completo y guarda (válido ~60–90 min).</li>
            </ol>
          </div>
          <textarea
            value={fetchSource}
            onChange={(event) => setFetchSource(event.target.value)}
            placeholder={'fetch("https://...analysis.windows.net/export/xlsx", { ... })'}
            rows={6}
            spellCheck={false}
            className="w-full resize-y rounded-[12px] border border-line bg-bg px-3 py-2 font-mono text-[11px] leading-5 text-ink outline-none ring-volt/40 focus:ring-2"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              icon={<ClipboardPaste size={16} />}
              disabled={savingDevTools || !fetchSource.trim()}
              onClick={() => void saveDevToolsToken()}
            >
              {savingDevTools ? "Guardando..." : connectedViaDevTools ? "Actualizar token" : "Guardar y probar"}
            </Button>
            {!status.connected ? (
              <Button type="button" variant="ghost" onClick={() => setShowDevTools(false)}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {connectedViaOAuth && status?.configuredOnServer ? (
        <p className="mt-3 text-[11px] text-muted">
          Si Microsoft pide aprobación de IT, usa el token de DevTools como alternativa temporal.
        </p>
      ) : null}
    </Card>
  );
}
