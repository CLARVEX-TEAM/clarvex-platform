"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RefreshCw, ShieldOff, Smartphone, TabletSmartphone } from "lucide-react";
import { AppFrame, AppHeader, Button, Card } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { nativeDeviceFetch, registerNativeDevice } from "@/lib/native-device-client";
import { enContenedorNativo } from "@/lib/puente-nativo";

type Device = {
  id: string;
  installationId: string;
  user: { name: string; role: string; active: boolean };
  profile: string;
  appBuild: number;
  appVersion: string;
  status: string;
  lastSeenAt: string;
  createdAt: string;
  revokedAt: string | null;
  notifications: boolean;
};

export default function DevicesPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const session = await getSession();
      if (!session) { router.replace("/login"); return; }
      if (!enContenedorNativo() || (session.role !== "GERENTE" && session.role !== "SUBGERENTE" && !session.platformAdmin)) {
        router.replace(session.role === "ASESOR" ? "/advisor" : "/manager");
        return;
      }
      await registerNativeDevice("PERSONAL");
      const response = await nativeDeviceFetch("/api/app/native/devices");
      const payload = await response.json() as { devices?: Device[]; currentDeviceId?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudieron cargar los dispositivos.");
      setDevices(payload.devices ?? []);
      setCurrentDeviceId(payload.currentDeviceId ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los dispositivos.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function update(deviceId: string, action: "REVOKE" | "ACTIVATE") {
    setBusy(deviceId);
    setError("");
    try {
      const response = await nativeDeviceFetch("/api/app/native/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, action })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo actualizar el dispositivo.");
      haptic("success");
      await load();
    } catch (updateError) {
      haptic("error");
      setError(updateError instanceof Error ? updateError.message : "No se pudo actualizar el dispositivo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <AppHeader title="Dispositivos" subtitle="Teléfonos vinculados a esta tienda" backHref="/mi-dia" />
      <AppFrame>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm leading-5 text-muted">Revocar corta funciones firmadas y elimina las notificaciones de ese equipo.</p>
          <button type="button" onClick={() => void load()} aria-label="Actualizar dispositivos" className="tappable grid size-11 shrink-0 place-items-center rounded-full bg-panel text-ink"><RefreshCw size={17} /></button>
        </div>

        {error ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</p> : null}
        {loading ? <div className="mt-4 h-40 animate-pulse rounded-2xl bg-panel" /> : null}

        <div className="mt-4 space-y-3">
          {devices.map((device) => {
            const active = device.status === "ACTIVE";
            const current = device.id === currentDeviceId;
            return (
              <Card key={device.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"}`}>
                    {device.profile === "KIOSK" ? <TabletSmartphone size={20} /> : <Smartphone size={20} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink">{device.user.name}</p>{current ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">Este teléfono</span> : null}</div>
                    <p className="mt-0.5 text-xs text-muted">{device.profile === "KIOSK" ? "Kiosco" : "Personal"} · APK {device.appVersion} ({device.appBuild})</p>
                    <p className="mt-1 text-xs text-muted">Última conexión {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(device.lastSeenAt))}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold">
                      {active ? <><CheckCircle2 size={14} className="text-emerald-600" /><span className="text-emerald-700 dark:text-emerald-300">Activo</span></> : <><ShieldOff size={14} className="text-rose-600" /><span className="text-rose-700 dark:text-rose-300">Revocado</span></>}
                      <span className="text-muted">· {device.notifications ? "avisos activos" : "sin avisos"}</span>
                    </div>
                  </div>
                </div>
                {!current ? (
                  <Button
                    className="mt-4 w-full"
                    variant={active ? "danger" : "success"}
                    loading={busy === device.id}
                    onClick={() => void update(device.id, active ? "REVOKE" : "ACTIVATE")}
                  >
                    {active ? "Revocar dispositivo" : "Volver a activar"}
                  </Button>
                ) : null}
              </Card>
            );
          })}
        </div>

        {!loading && devices.length === 0 ? <p className="py-10 text-center text-sm text-muted">Todavía no hay dispositivos vinculados.</p> : null}
      </AppFrame>
    </>
  );
}
