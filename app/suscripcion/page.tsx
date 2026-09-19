"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { money } from "@/lib/format";
import { AppFrame, AppHeader, Badge, Button, Card } from "@/components/ui";
import { enContenedorNativo } from "@/lib/puente-nativo";
import { portadaDe } from "@/lib/portada";

export const dynamic = "force-dynamic";

type Status = {
  storeName: string;
  state: "exenta" | "activa" | "por_vencer" | "vencida" | "sin_pago";
  daysLeft: number | null;
  activeUsers: number;
  pricePerUserMxn: number;
  amountMxn: number;
  paidUntil: string | null;
  canPayOnline: boolean;
  payments: Array<{ id: string; amountMxn: number; method: string | null; paidAt: string; periodEnd: string }>;
};

const STATE_UI: Record<Status["state"], { label: string; tone: "success" | "warn" | "danger" | "default"; text: string }> = {
  exenta: { label: "Cortesía", tone: "success", text: "Tu tienda está exenta de pago." },
  activa: { label: "Activa", tone: "success", text: "Tu suscripción está al corriente." },
  por_vencer: { label: "Por vencer", tone: "warn", text: "Tu suscripción está por vencer. Renueva para no perder el acceso." },
  vencida: { label: "Vencida", tone: "danger", text: "Tu suscripción venció. Paga para reactivar el acceso de tu equipo." },
  sin_pago: { label: "Sin pago", tone: "danger", text: "Aún no hay un pago registrado. Paga tu primera mensualidad para activar." }
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

export default function SubscriptionPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [paidNotice, setPaidNotice] = useState<string | null>(null);

  useEffect(() => {
    // Leemos el resultado del pago del query sin useSearchParams (evita el
    // error de prerender de Next en páginas cliente).
    setPaidNotice(new URLSearchParams(window.location.search).get("pago"));
  }, []);

  const load = useCallback(() => {
    fetch("/api/billing/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<Status> : Promise.reject(new Error(String(response.status))))
      .then(setStatus)
      .catch(() => setError("No se pudo cargar la suscripción."));
  }, []);

  useEffect(() => {
    getSession().then((session) => {
      if (!session) { router.replace("/login"); return; }
      if (session.role === "ASESOR") { router.replace(portadaDe(session, enContenedorNativo())); return; }
      load();
    }).catch(() => {});
  }, [router, load]);

  async function pay() {
    setPaying(true);
    setError("");
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" });
      const payload = await response.json() as { initPoint?: string; error?: string };
      if (!response.ok || !payload.initPoint) throw new Error(payload.error ?? "No se pudo iniciar el pago.");
      window.location.href = payload.initPoint; // Checkout de Mercado Pago
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar el pago.");
      setPaying(false);
    }
  }

  const ui = status ? STATE_UI[status.state] : null;

  return (
    <>
      <AppHeader title="Suscripción" subtitle="Estado y pago de tu tienda" backHref="/manager" />
      <AppFrame>
        {paidNotice === "ok" ? (
          <Card className="mb-3 flex items-center gap-2 border border-emerald-400/30 bg-emerald-50 p-3 text-sm font-bold text-emerald-700 dark:bg-emerald-950/30">
            <CheckCircle2 size={16} /> Recibimos tu pago. Puede tardar unos minutos en reflejarse.
          </Card>
        ) : null}
        {error ? <Card className="mb-3 p-3 text-sm font-semibold text-rose-700">{error}</Card> : null}

        {!status ? (
          <Card className="p-4 text-sm font-semibold text-muted">Cargando…</Card>
        ) : (
          <>
            <Card className="mb-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{status.storeName}</p>
                  <h2 className="mt-1 text-2xl font-semibold text-ink">{money(status.amountMxn)}<span className="text-sm font-bold text-muted"> / mes</span></h2>
                  <p className="mt-0.5 text-xs text-muted">{status.activeUsers} usuario{status.activeUsers === 1 ? "" : "s"} × {money(status.pricePerUserMxn)} · IVA incl.</p>
                </div>
                {ui ? <Badge tone={ui.tone}>{ui.label}</Badge> : null}
              </div>
              <p className="mt-3 text-sm text-muted">{ui?.text}</p>
              {status.paidUntil && status.state !== "exenta" ? (
                <p className="mt-2 text-sm font-bold text-ink">
                  {status.state === "vencida" ? "Venció el " : "Pagada hasta el "}{fmtDate(status.paidUntil)}
                  {status.daysLeft !== null && status.daysLeft >= 0 ? <span className="font-semibold text-muted"> · {status.daysLeft} día{status.daysLeft === 1 ? "" : "s"}</span> : null}
                </p>
              ) : null}
            </Card>

            {status.state !== "exenta" ? (
              status.canPayOnline ? (
                <Button type="button" variant="primary" className="w-full" disabled={paying} onClick={() => void pay()}>
                  {paying ? <><Loader2 size={16} className="animate-spin" /> Redirigiendo…</> : <><CreditCard size={16} /> Pagar mensualidad</>}
                </Button>
              ) : (
                <Card className="p-4 text-sm text-muted">
                  El pago en línea aún no está disponible. Realiza tu pago por transferencia y administración lo registrará.
                </Card>
              )
            ) : null}

            {status.canPayOnline ? (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-muted">
                <ShieldCheck size={13} /> Pago seguro con Mercado Pago · tarjeta, SPEI u OXXO
              </p>
            ) : null}

            {status.payments.length > 0 ? (
              <Card className="mt-4 p-3.5">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Pagos recientes</p>
                <div className="divide-y divide-line">
                  {status.payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-semibold text-ink">{money(payment.amountMxn)}</p>
                        <p className="text-[11px] font-semibold text-muted">{fmtDate(payment.paidAt)}{payment.method ? ` · ${payment.method}` : ""}</p>
                      </div>
                      <Badge tone="success">Hasta {fmtDate(payment.periodEnd)}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
          </>
        )}
      </AppFrame>
    </>
  );
}
