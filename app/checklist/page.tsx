"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import { ImagenAmpliable } from "@/components/VisorImagen";
import { Camera, Check, CheckCircle2, FileText, RotateCcw, ChevronDown, Circle, Clock3, ExternalLink, FileCheck2, Images, LogOut, Moon, RefreshCw, ScanLine, ScrollText, SlidersHorizontal, Sun, X } from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import { compressImage } from "@/lib/image-compress";
import { DocScanner } from "@/components/DocScanner";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, Card, ProgressBar } from "@/components/ui";
import { puedeConAsistenciaAxo } from "@/lib/operational-checklist-reminders";
import { NumberTicker } from "@/components/externos/number-ticker";
import { ShineBorder } from "@/components/externos/shine-border";
import { enContenedorNativo, scannerDocumentosNativo, urlArchivoNativo } from "@/lib/puente-nativo";
import { portadaDe } from "@/lib/portada";
import { EVENTO_ENTREGA, encolar } from "@/lib/cola-envio";
import { camposDeEscaneo, camposDeEvidencia, camposDeTarea } from "@/lib/cola-checklist";

type Section = "APERTURA" | "CIERRE";
type ScanPhoto = { id: string; url: string; fileName: string | null; createdAt: string };
type ChecklistItem = {
  key: string;
  label: string;
  section: Section;
  kind: "check" | "scan";
  completed: boolean;
  note: string | null;
  evidenceUrl: string | null;
  completedAt: string | null;
  completedBy: string | null;
  scans: ScanPhoto[];
};
type AxoAttendance = {
  enabled: true;
  date: string;
  dateLabel: string;
  dueTime: string;
  formUrl: string;
  status: "CONFIRMED" | "PENDING" | "OVERDUE";
  confirmedAt: string | null;
  confirmedBy: string | null;
  people: Array<{
    name: string;
    role: string;
    roleLabel: string;
    expectedAt: string;
    arrivedAt: string | null;
    attendanceCaptured: boolean;
  }>;
};

/** Un escaneo (varias fotos) se considera hecho cuando ya tiene al menos una. */
function isDone(item: ChecklistItem): boolean {
  return item.kind === "scan" ? item.scans.length > 0 : item.completed;
}

const SECTIONS: { id: Section; label: string; icon: typeof Sun }[] = [
  { id: "APERTURA", label: "Apertura", icon: Sun },
  { id: "CIERRE", label: "Cierre", icon: Moon }
];

export default function ChecklistPage() {
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [axoAttendance, setAxoAttendance] = useState<AxoAttendance | null>(null);
  const [axoConfirming, setAxoConfirming] = useState(false);
  const [axoError, setAxoError] = useState("");
  const [activeSection, setActiveSection] = useState<Section>("APERTURA");
  const [nativeExperience, setNativeExperience] = useState(false);
  // Foto recién capturada, esperando que se ajusten las esquinas en el escáner.
  const [scanning, setScanning] = useState<{ item: ChecklistItem; file: File } | null>(null);

  useEffect(() => {
    setNativeExperience(enContenedorNativo());
    getSession().then((current) => {
      if (!current) { router.replace("/login"); return; }
      // El usuario kiosko SÍ entra aquí aunque sea ASESOR (es su única pantalla).
      if (!current.checklistOnly && current.role === "ASESOR") { router.replace(portadaDe(current, enContenedorNativo())); return; }
      setSession(current);
    });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    void load();
    // El kiosko tambien: es el telefono que esta a la mano al abrir la tienda,
    // que es justo cuando hay que pasar la lista al Forms. Lo decide
    // `puedeConAsistenciaAxo`, el mismo criterio que aplica el servidor.
    if (puedeConAsistenciaAxo(session)) void loadAxoAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  /*
   * Cuando la cola consigue mandar lo que estaba guardado, la pantalla tiene que
   * enterarse: sin esto, la evidencia ya subida no aparecería hasta recargar y
   * la persona la volvería a tomar.
   */
  useEffect(() => {
    if (!session) return;
    const alCambiar = () => { void silentRefresh(); };
    window.addEventListener(EVENTO_ENTREGA, alCambiar);
    return () => window.removeEventListener(EVENTO_ENTREGA, alCambiar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function loadAxoAttendance() {
    try {
      const response = await fetch("/api/attendance-axo", { cache: "no-store" });
      const payload = await response.json() as AxoAttendance | { enabled: false };
      if (response.ok && payload.enabled) setAxoAttendance(payload);
    } catch {
      // El checklist principal sigue funcionando aunque este apoyo no cargue.
    }
  }

  async function confirmAxoAttendance() {
    setAxoConfirming(true);
    setAxoError("");
    try {
      const response = await fetch("/api/attendance-axo", { method: "POST" });
      const payload = await response.json() as AxoAttendance | { error?: string };
      if (!response.ok || !("enabled" in payload) || !payload.enabled) {
        throw new Error("error" in payload ? payload.error : "No se pudo registrar el envío.");
      }
      setAxoAttendance(payload);
    } catch (requestError) {
      setAxoError(requestError instanceof Error ? requestError.message : "No se pudo registrar el envío.");
    } finally {
      setAxoConfirming(false);
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/checklist", { cache: "no-store" });
      const payload = await response.json() as { date: string; items: ChecklistItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar el checklist.");
      setItems(payload.items);
      setDate(payload.date);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo cargar el checklist.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Refresco silencioso (sin spinner): para reflejar las páginas de vouchers que
   * se copian a la tarea de cierre del lado del servidor, y lo que la cola
   * consigue entregar después.
   *
   * ⚠️ **Las entregas seguidas se juntan en UN refresco.** El escáner nativo
   * admite 25 páginas: sin esta guarda, vaciar la cola pediría el checklist
   * entero 25 veces seguidas, justo cuando la señal acaba de volver y es mala.
   * Al terminar se vuelve a mirar una vez, para no perder lo que llegó mientras
   * tanto.
   */
  const refrescando = useRef(false);
  const refrescoPendiente = useRef(false);

  async function silentRefresh(): Promise<void> {
    if (refrescando.current) { refrescoPendiente.current = true; return; }
    refrescando.current = true;
    try {
      await pedirChecklist();
    } finally {
      refrescando.current = false;
      if (refrescoPendiente.current) {
        refrescoPendiente.current = false;
        void silentRefresh();
      }
    }
  }

  async function pedirChecklist() {
    try {
      const response = await fetch("/api/checklist", { cache: "no-store" });
      const payload = await response.json() as { items: ChecklistItem[] };
      if (response.ok) setItems(payload.items);
    } catch {
      // silencioso a propósito
    }
  }

  /**
   * Manda la petición y distingue «el servidor dijo que no» de «no salió de
   * aquí».
   *
   * ⚠️ Es la misma lección de `getSession()`: confundirlos pierde la captura
   * cuando solo parpadeó la señal, o esconde un rechazo real como si fuera falta
   * de red. Solo lo segundo se encola.
   */
  async function mandar(ruta: string, init: RequestInit): Promise<Response | null> {
    try {
      return await fetch(ruta, init);
    } catch {
      return null;
    }
  }

  async function toggle(item: ChecklistItem) {
    setBusyKey(item.key);
    const previous = items;
    setItems((current) => current.map((i) => i.key === item.key ? { ...i, completed: !i.completed } : i));
    try {
      const response = await mandar("/api/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: item.key, completed: !item.completed, note: item.note ?? undefined })
      });

      if (response === null) {
        // Sin red: se guarda para mandarla al haber señal y la marca SE QUEDA.
        // Devolverla a su sitio haría creer que no se registró.
        const encolada = await encolar({
          ruta: "/api/checklist",
          etiqueta: item.label,
          campos: camposDeTarea(item, date, !item.completed)
        });
        if (!encolada) {
          setItems(previous);
          setError("Sin conexión y sin sitio para guardarla. Inténtalo otra vez.");
        }
        return;
      }

      const payload = await response.json() as { items: ChecklistItem[] };
      if (!response.ok) throw new Error();
      setItems(payload.items);
    } catch {
      setItems(previous);
    } finally {
      setBusyKey(null);
    }
  }

  async function attachPhoto(item: ChecklistItem, file: File) {
    setBusyKey(item.key);
    setError("");
    try {
      // En kiosko (celular de la tienda, gama baja) la evidencia se comprime más:
      // sube más rápido y no necesita alta resolución (es prueba de la tarea).
      const image = session?.checklistOnly
        ? await compressImage(file, 1500, 0.78)
        : await compressImage(file);
      const form = new FormData();
      form.append("itemKey", item.key);
      form.append("completed", String(item.completed));
      if (item.note) form.append("note", item.note);
      form.append("image", image, "evidencia.jpg");
      const response = await mandar("/api/checklist", { method: "POST", body: form });

      if (response === null) {
        const encolada = await encolar({
          ruta: "/api/checklist",
          etiqueta: `Evidencia de ${item.label}`,
          campos: camposDeEvidencia(item, date, item.completed, image),
          nombreArchivo: "evidencia.jpg"
        });
        setAviso(encolada
          ? "Sin conexión: la foto quedó guardada y se envía sola al volver la señal."
          : "");
        if (!encolada) setError("Sin conexión y sin sitio para guardar la foto. Inténtalo otra vez.");
        return;
      }

      const payload = await response.json() as { items: ChecklistItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo subir la evidencia.");
      setItems(payload.items);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo subir la evidencia.");
    } finally {
      setBusyKey(null);
    }
  }

  async function addScan(item: ChecklistItem, image: Blob) {
    setBusyKey(item.key);
    setError("");
    try {
      // La imagen ya viene enderezada y con el fondo blanco desde el escáner.
      const form = new FormData();
      form.append("itemKey", item.key);
      if (date) form.append("date", date);
      form.append("image", image, "escaneo.jpg");
      const response = await mandar("/api/checklist/scan", { method: "POST", body: form });

      if (response === null) {
        /*
         * Sin red la página queda encolada, pero NO se pinta una miniatura: no
         * hay todavía ni id ni foto servida, y dibujar una falsa haría creer que
         * ya subió. El aviso y la franja de arriba dicen lo que hay.
         */
        const encolada = await encolar({
          ruta: "/api/checklist/scan",
          etiqueta: `Página de ${item.label}`,
          campos: camposDeEscaneo(item, date, image),
          nombreArchivo: "escaneo.jpg"
        });
        setAviso(encolada
          ? "Sin conexión: la página quedó guardada y se envía sola al volver la señal."
          : "");
        if (!encolada) setError("Sin conexión y sin sitio para guardar la página. Inténtalo otra vez.");
        return;
      }

      const payload = await response.json() as { scan?: ScanPhoto; error?: string };
      if (!response.ok || !payload.scan) throw new Error(payload.error ?? "No se pudo subir la foto.");
      const added = payload.scan;
      setItems((current) => current.map((i) => i.key === item.key ? { ...i, scans: [...i.scans, added] } : i));
      // Los vouchers se copian a la tarea de cierre en el servidor → refrescar
      // para que esas páginas aparezcan también allá.
      if (item.label.toLowerCase().includes("voucher")) void silentRefresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo subir la foto.");
    } finally {
      setBusyKey(null);
    }
  }

  async function addNativeScans(item: ChecklistItem) {
    const scanner = scannerDocumentosNativo();
    if (!scanner) return;
    setBusyKey(item.key);
    setError("");
    try {
      const result = await scanner.escanear({ limite: 25, galeria: true });
      if (result.cancelado || result.paginas.length === 0) return;
      const blobs: Blob[] = [];
      for (const path of result.paginas) {
        const url = urlArchivoNativo(path);
        if (!url) throw new Error("La APK no pudo abrir una página escaneada.");
        const response = await fetch(url);
        if (!response.ok) throw new Error("La APK no pudo leer una página escaneada.");
        blobs.push(await response.blob());
      }
      /*
       * ⚠️ **En cuanto UNA página se encola, van a la cola TODAS las siguientes.**
       *
       * Estas páginas se juntan en un PDF y el orden es el del envío. Si la 3 se
       * encola por un corte de señal y la 4 se manda directa porque la señal
       * volvió, el PDF sale con la 4 antes que la 3 — y eso no se ve hasta abrir
       * el documento ya entregado.
       */
      let sinRed = false;
      let encoladas = 0;
      for (let index = 0; index < blobs.length; index++) {
        const pagina = blobs[index];
        if (!pagina) continue;
        const nombre = `escaneo-${index + 1}.jpg`;

        if (!sinRed) {
          const form = new FormData();
          form.append("itemKey", item.key);
          if (date) form.append("date", date);
          form.append("image", pagina, nombre);
          const response = await mandar("/api/checklist/scan", { method: "POST", body: form });
          if (response !== null) {
            const payload = await response.json() as { scan?: ScanPhoto; error?: string };
            if (!response.ok || !payload.scan) throw new Error(payload.error ?? `No se pudo subir la página ${index + 1}.`);
            const added = payload.scan;
            setItems((current) => current.map((entry) => entry.key === item.key
              ? { ...entry, scans: [...entry.scans, added] }
              : entry));
            continue;
          }
          sinRed = true;
        }

        const encolada = await encolar({
          ruta: "/api/checklist/scan",
          etiqueta: `Página ${index + 1} de ${item.label}`,
          campos: camposDeEscaneo(item, date, pagina),
          nombreArchivo: nombre
        });
        if (!encolada) {
          setError(`Sin conexión y sin sitio para guardar la página ${index + 1}. Vuelve a escanearla.`);
          break;
        }
        encoladas += 1;
      }

      if (encoladas > 0) {
        setAviso(`Sin conexión: ${encoladas} página(s) quedaron guardadas y se envían solas al volver la señal.`);
      }
      if (item.label.toLowerCase().includes("voucher")) void silentRefresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo usar el escáner nativo.");
    } finally {
      setBusyKey(null);
    }
  }

  async function removeScan(item: ChecklistItem, scanId: string) {
    setError("");
    const previous = items;
    setItems((current) => current.map((i) => i.key === item.key ? { ...i, scans: i.scans.filter((s) => s.id !== scanId) } : i));
    try {
      const response = await fetch(`/api/checklist/scan?id=${scanId}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
    } catch {
      setItems(previous);
      setError("No se pudo borrar la foto.");
    }
  }

  async function generatePdf(item: ChecklistItem): Promise<{ pdfUrl: string; sentToTelegram: boolean }> {
    const response = await fetch("/api/checklist/scan/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemKey: item.key, date: date || undefined })
    });
    const payload = await response.json() as { pdfUrl?: string; sentToTelegram?: boolean; error?: string };
    if (!response.ok || !payload.pdfUrl) throw new Error(payload.error ?? "No se pudo generar el PDF.");
    return { pdfUrl: payload.pdfUrl, sentToTelegram: payload.sentToTelegram ?? false };
  }

  const dateLabel = date
    ? new Date(`${date}T00:00:00Z`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    : "";

  // Usuario kiosko (celular de la tienda): sin navegación ni "atrás", solo salir.
  const kiosk = session?.checklistOnly === true;
  return (
    <>
      <AppHeader
        title="Checklist de tienda"
        subtitle={dateLabel ? dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1) : "Apertura y cierre"}
        backHref={kiosk ? undefined : "/manager"}
        action={kiosk ? (
          <button type="button" onClick={() => void logout().then(() => router.replace("/login"))} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition active:scale-95">
            <LogOut size={14} />Salir
          </button>
        ) : (
          <button type="button" onClick={() => router.push("/checklist/config")} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition active:scale-95 hover:text-volt">
            <SlidersHorizontal size={14} />Editar
          </button>
        )}
      />
      <AppFrame>
        {error ? <Card className="mb-3 text-sm font-semibold text-orchid">{error}</Card> : null}
        {aviso ? <Card className="mb-3 text-sm font-semibold text-sky">{aviso}</Card> : null}
        {axoAttendance ? (
          <AxoAttendanceCard
            report={axoAttendance}
            confirming={axoConfirming}
            error={axoError}
            onConfirm={() => void confirmAxoAttendance()}
          />
        ) : null}
        {loading ? (
          <Card className="text-sm font-semibold text-muted">Cargando checklist...</Card>
        ) : nativeExperience ? (
          <NativeChecklist
            items={items}
            activeSection={activeSection}
            busyKey={busyKey}
            onSection={setActiveSection}
            onToggle={(item) => void toggle(item)}
            onPhoto={(item, file) => void attachPhoto(item, file)}
            onCapture={(item, file) => setScanning({ item, file })}
            onNativeScan={(item) => void addNativeScans(item)}
            onRemove={(item, scanId) => void removeScan(item, scanId)}
            onGeneratePdf={(item) => generatePdf(item)}
          />
        ) : (
          <div className="space-y-3">
            {SECTIONS.map((section) => {
              const sectionItems = items.filter((item) => item.section === section.id);
              const done = sectionItems.filter(isDone).length;
              const total = sectionItems.length;
              const progress = total ? Math.round((done / total) * 100) : 0;
              const SectionIcon = section.icon;
              return (
                <Card key={section.id} className="p-3.5">
                  <div className="mb-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <SectionIcon className="text-volt" size={18} />
                      <h2 className="text-lg font-semibold">{section.label}</h2>
                    </div>
                    <Badge tone={done === total ? "success" : "default"}>{done}/{total}</Badge>
                  </div>
                  <ProgressBar value={progress} />
                  <div className="mt-2 divide-y divide-line">
                    {sectionItems.map((item) => item.kind === "scan" ? (
                      <ScanRow
                        key={item.key}
                        item={item}
                        busy={busyKey === item.key}
                        onCapture={(file) => setScanning({ item, file })}
                        onRemove={(scanId) => void removeScan(item, scanId)}
                        onGeneratePdf={() => generatePdf(item)}
                      />
                    ) : (
                      <ChecklistRow
                        key={item.key}
                        item={item}
                        busy={busyKey === item.key}
                        onToggle={() => void toggle(item)}
                        onPhoto={(file) => void attachPhoto(item, file)}
                      />
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </AppFrame>
      {scanning ? (
        <DocScanner
          file={scanning.file}
          lite={kiosk}
          onDone={(blob) => { const { item } = scanning; setScanning(null); void addScan(item, blob); }}
          onCancel={() => setScanning(null)}
        />
      ) : null}
    </>
  );
}

function NativeChecklist({
  items,
  activeSection,
  busyKey,
  onSection,
  onToggle,
  onPhoto,
  onCapture,
  onNativeScan,
  onRemove,
  onGeneratePdf
}: {
  items: ChecklistItem[];
  activeSection: Section;
  busyKey: string | null;
  onSection: (section: Section) => void;
  onToggle: (item: ChecklistItem) => void;
  onPhoto: (item: ChecklistItem, file: File) => void;
  onCapture: (item: ChecklistItem, file: File) => void;
  onNativeScan: (item: ChecklistItem) => void;
  onRemove: (item: ChecklistItem, scanId: string) => void;
  onGeneratePdf: (item: ChecklistItem) => Promise<{ pdfUrl: string; sentToTelegram: boolean }>;
}) {
  const done = items.filter(isDone).length;
  const total = items.length;
  const progress = total ? Math.round((done / total) * 100) : 0;
  const sectionItems = items.filter((item) => item.section === activeSection);
  const pendingItems = sectionItems.filter((item) => !isDone(item));
  const completedItems = sectionItems.filter(isDone);
  const nativeScannerAvailable = Boolean(scannerDocumentosNativo());

  if (items.length === 0) {
    return (
      <section className="papel-elev rounded-[20px] border border-line bg-card px-5 py-7 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-[15px] bg-volt/10 text-volt">
          <CheckCircle2 size={19} />
        </span>
        <h2 className="mt-3 text-[15px] font-semibold text-ink">Sin puntos configurados</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">Gerencia puede agregar puntos desde Editar.</p>
      </section>
    );
  }

  return (
    <div className="space-y-5" data-native-checklist>
      {/*
        El bloque que manda, con el degradado del LOGOTIPO.

        ⚠️ Antes llevaba un azul (`#172033`) y un verde (`#76E3B5`) escritos a
        mano, de ninguna paleta: no se movían con el tema ni con la marca. Ahora
        sale de `.papel-hero`, así que si mañana cambia el logo cambia esto.

        ⚠️ El verde SÍ se pierde, y se gana: en esta app el verde significa
        «pasó la meta». Usándolo también para «llevas el 40 % del checklist»
        dejaba de significar cualquiera de las dos cosas.
      */}
      <section className="papel-hero papel-elev-alta relative overflow-hidden rounded-[26px]">
        <svg
          aria-hidden
          viewBox="0 0 512 512"
          className="pointer-events-none absolute -right-10 -top-12 size-56 opacity-[0.07]"
        >
          <path fill="#FFFFFF" d="M108 171 256 86 403 171 210 283v-57l93-53-47-27-95 55v111l95 56 48-28v-57l99 58-147 85-148-84V171Z" />
        </svg>
        <ShineBorder borderWidth={2} duration={13} shineColor={["#FFFFFF", "#8BB8FF", "#FFFFFF"]} />
        <div className="relative px-6 pb-5 pt-6">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.09em] opacity-80">Avance de hoy</div>
              <p className="mt-2 text-[17px] font-semibold leading-snug">
                {done === total ? "La tienda terminó el checklist." : `${total - done} ${total - done === 1 ? "punto pendiente" : "puntos pendientes"}`}
              </p>
            </div>
            {/* El porcentaje SUBE al abrir: cambia con cada punto que se marca. */}
            <p className="flex shrink-0 items-baseline">
              <NumberTicker value={progress} className="text-[44px] font-bold leading-none tracking-[-0.04em] text-ink tabular-nums" />
              <span className="text-xl font-semibold opacity-70">%</span>
            </p>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/25" aria-label={`${progress}% completado`}>
            <div className="h-full rounded-full bg-white transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between text-sm opacity-80">
            <span>{done} completados</span>
            <span>{total} en total</span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-black/4.5 p-1.5 dark:bg-white/5.5" role="tablist" aria-label="Momento del checklist">
        {SECTIONS.map((section) => {
          const sectionTotal = items.filter((item) => item.section === section.id);
          const sectionDone = sectionTotal.filter(isDone).length;
          const selected = activeSection === section.id;
          const SectionIcon = section.icon;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSection(section.id)}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition focus:outline-hidden focus-visible:ring-4 focus-visible:ring-volt/30 ${selected ? "bg-panel text-ink shadow-[0_5px_16px_rgb(15_23_42/0.12)]" : "text-muted"}`}
            >
              <SectionIcon size={17} />
              <span>{section.label}</span>
              <span className="tabular-nums text-xs opacity-65">{sectionDone}/{sectionTotal.length}</span>
            </button>
          );
        })}
      </div>

      <section aria-labelledby={`section-${activeSection}`}>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 id={`section-${activeSection}`} className="text-lg font-semibold tracking-tight text-ink">
              {pendingItems.length ? "Siguiente por hacer" : `${activeSection === "APERTURA" ? "Apertura" : "Cierre"} completo`}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {pendingItems.length ? "Completa en orden o elige otro punto." : "Todo quedó registrado en esta sección."}
            </p>
          </div>
          {pendingItems.length > 0 ? <Badge>{pendingItems.length} pendientes</Badge> : <Badge tone="success">Listo</Badge>}
        </div>

        <div className="space-y-2.5">
          {pendingItems.map((item, index) => item.kind === "scan" ? (
            <ScanRow
              key={item.key}
              item={item}
              busy={busyKey === item.key}
              native
              featured={index === 0}
              onNativeScan={nativeScannerAvailable ? () => onNativeScan(item) : undefined}
              onCapture={(file) => onCapture(item, file)}
              onRemove={(scanId) => onRemove(item, scanId)}
              onGeneratePdf={() => onGeneratePdf(item)}
            />
          ) : (
            <ChecklistRow
              key={item.key}
              item={item}
              busy={busyKey === item.key}
              native
              featured={index === 0}
              onToggle={() => onToggle(item)}
              onPhoto={(file) => onPhoto(item, file)}
            />
          ))}
        </div>

        {completedItems.length > 0 ? (
          <details className="group mt-5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl px-1 text-sm font-semibold text-muted focus:outline-hidden focus-visible:ring-4 focus-visible:ring-volt/30">
              <span>{completedItems.length} {completedItems.length === 1 ? "punto completado" : "puntos completados"}</span>
              <ChevronDown size={18} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-2.5">
              {completedItems.map((item) => item.kind === "scan" ? (
                <ScanRow
                  key={item.key}
                  item={item}
                  busy={busyKey === item.key}
                  native
                  onNativeScan={nativeScannerAvailable ? () => onNativeScan(item) : undefined}
                  onCapture={(file) => onCapture(item, file)}
                  onRemove={(scanId) => onRemove(item, scanId)}
                  onGeneratePdf={() => onGeneratePdf(item)}
                />
              ) : (
                <ChecklistRow
                  key={item.key}
                  item={item}
                  busy={busyKey === item.key}
                  native
                  onToggle={() => onToggle(item)}
                  onPhoto={(file) => onPhoto(item, file)}
                />
              ))}
            </div>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function AxoAttendanceCard({ report, confirming, error, onConfirm }: {
  report: AxoAttendance;
  confirming: boolean;
  error: string;
  onConfirm: () => void;
}) {
  const confirmed = report.status === "CONFIRMED";
  const overdue = report.status === "OVERDUE";
  return (
    <Card className="mb-3 p-3.5">
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${confirmed ? "bg-mint/10 text-mint" : overdue ? "bg-orchid/10 text-orchid" : "bg-volt/10 text-volt"}`}>
          {confirmed ? <CheckCircle2 size={19} /> : <FileCheck2 size={19} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-ink">Asistencia AXO</h2>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${confirmed ? "bg-mint/10 text-mint" : overdue ? "bg-orchid/10 text-orchid" : "bg-ember/10 text-ember"}`}>
              {confirmed ? "Enviado" : overdue ? "Fuera de horario" : `Antes de ${report.dueTime}`}
            </span>
          </div>
          {confirmed ? (
            <p className="mt-1 text-xs leading-5 text-muted">
              Confirmado por {report.confirmedBy ?? "gerencia"} a las {new Date(report.confirmedAt!).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}.
            </p>
          ) : (
            <p className="mt-1 text-xs leading-5 text-muted">
              Ten listas las imágenes del POS y la foto grupal. Envía el formulario oficial y después registra la confirmación aquí.
            </p>
          )}
        </div>
      </div>

      {!confirmed && report.people.length ? (
        <details className="mt-3 rounded-xl bg-black/[0.035] px-3 py-2 dark:bg-white/5">
          <summary className="cursor-pointer text-xs font-bold text-ink">
            Lista para capturar · {report.people.length} {report.people.length === 1 ? "persona" : "personas"}
          </summary>
          <div className="mt-2 max-h-52 divide-y divide-line/70 overflow-y-auto">
            {report.people.map((person) => (
              <div key={`${person.role}-${person.name}`} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-ink">{person.name}</p>
                  <p className="text-[11px] text-muted">{person.roleLabel} · Entrada programada {person.expectedAt}</p>
                </div>
                <span className={`shrink-0 text-[11px] font-bold ${person.arrivedAt ? "text-mint" : "text-ember"}`}>
                  {person.arrivedAt ?? "Sin captura"}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {!confirmed ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <a
            href={report.formUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-volt px-4 text-sm font-semibold text-white shadow-[0_8px_20px_rgb(37_99_235/0.22)] transition hover:bg-volt/85 active:scale-95 focus:outline-hidden focus-visible:ring-4 focus-visible:ring-volt/40"
          >
            <ExternalLink size={17} /> Abrir Forms de AXO
          </a>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line bg-panel px-4 text-sm font-semibold text-ink transition hover:border-volt hover:text-volt active:scale-95 disabled:opacity-55 focus:outline-hidden focus-visible:ring-4 focus-visible:ring-volt/40"
          >
            <Clock3 size={17} /> {confirming ? "Registrando…" : "Registrar como enviado"}
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs font-semibold text-orchid">{error}</p> : null}
      <p className="mt-2 text-[10px] leading-4 text-muted">
        Microsoft conserva la respuesta oficial. Clarvex registra la confirmación de gerencia.
      </p>
    </Card>
  );
}

function ChecklistRow({ item, busy, native = false, featured = false, onToggle, onPhoto }: {
  item: ChecklistItem;
  busy: boolean;
  native?: boolean;
  featured?: boolean;
  onToggle: () => void;
  onPhoto: (file: File) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  if (native) {
    return (
      <article className={`rounded-2xl bg-panel px-4 py-4 ${featured ? "shadow-[0_12px_30px_rgb(15_23_42/0.13)]" : "shadow-[0_5px_18px_rgb(15_23_42/0.07)]"}`}>
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${item.completed ? "bg-mint/10 text-mint dark:bg-mint/12 dark:text-mint" : featured ? "bg-volt/10 text-volt dark:bg-volt/12 dark:text-volt" : "bg-black/4.5 text-muted dark:bg-white/6"}`}>
            {item.completed ? <CheckCircle2 size={19} /> : <Circle size={19} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className={`text-[15px] font-semibold leading-5 ${item.completed ? "text-muted" : "text-ink"}`}>{item.label}</p>
            <p className="mt-1 text-xs leading-4 text-muted">
              {busy ? "Guardando el cambio…" : item.completedAt
                ? `Completado ${new Date(item.completedAt).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}${item.completedBy ? ` · ${item.completedBy}` : ""}`
                : item.evidenceUrl ? "Tiene evidencia · falta completar" : "Sin completar"}
            </p>
          </div>
          {item.evidenceUrl ? (
            <ImagenAmpliable src={item.evidenceUrl} alt="Evidencia" className="shrink-0">
              <NextImage src={item.evidenceUrl} alt="Evidencia" width={44} height={44} className="size-11 rounded-xl object-cover" unoptimized />
            </ImagenAmpliable>
          ) : null}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            disabled={busy}
            aria-pressed={item.completed}
            className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-55 focus:outline-hidden focus-visible:ring-4 focus-visible:ring-volt/30 ${!item.completed && featured ? "bg-volt text-white shadow-[0_7px_18px_rgb(37_99_235/0.23)]" : "bg-black/4.5 text-ink dark:bg-white/6"}`}
          >
            {busy ? <RefreshCw size={17} className="animate-spin" /> : item.completed ? <RotateCcw size={17} /> : <Check size={18} />}
            {busy ? "Guardando…" : item.completed ? "Marcar pendiente" : "Completar punto"}
          </button>
          <details className="group relative">
            <summary className="grid size-12 cursor-pointer list-none place-items-center rounded-xl bg-black/4.5 text-muted transition active:scale-95 focus:outline-hidden focus-visible:ring-4 focus-visible:ring-volt/30 dark:bg-white/6" aria-label="Opciones de evidencia">
              <Camera size={18} />
            </summary>
            <div className="absolute bottom-14 right-0 z-10 w-52 overflow-hidden rounded-2xl bg-panel p-1.5 shadow-[0_14px_40px_rgb(15_23_42/0.22)]">
              <button type="button" onClick={() => cameraRef.current?.click()} disabled={busy} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-ink hover:bg-black/4 disabled:opacity-50 dark:hover:bg-white/5">
                <Camera size={17} className="text-volt" /> Tomar evidencia
              </button>
              <button type="button" onClick={() => galleryRef.current?.click()} disabled={busy} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-ink hover:bg-black/4 disabled:opacity-50 dark:hover:bg-white/5">
                <Images size={17} className="text-volt" /> Elegir de galería
              </button>
            </div>
          </details>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPhoto(file); event.target.value = ""; }} />
        <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPhoto(file); event.target.value = ""; }} />
      </article>
    );
  }
  return (
    <div className="flex items-center gap-3 py-2.5">
      <button type="button" onClick={onToggle} disabled={busy} aria-pressed={item.completed} className="shrink-0 transition active:scale-90 disabled:opacity-50">
        {item.completed ? <CheckCircle2 className="text-mint" size={24} /> : <Circle className="text-muted" size={24} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${item.completed ? "text-muted line-through" : "text-ink"}`}>{item.label}</p>
        {item.completedAt ? <p className="text-[11px] text-muted">✓ {new Date(item.completedAt).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}</p> : null}
      </div>
      {item.evidenceUrl ? (
        <ImagenAmpliable src={item.evidenceUrl} alt="Evidencia" className="shrink-0">
          <NextImage src={item.evidenceUrl} alt="Evidencia" width={40} height={40} className="size-10 rounded-lg object-cover" unoptimized />
        </ImagenAmpliable>
      ) : null}
      <button type="button" onClick={() => cameraRef.current?.click()} disabled={busy} aria-label="Tomar foto" className="grid size-9 shrink-0 place-items-center rounded-xl border border-line text-muted transition hover:border-volt hover:text-volt active:scale-90 disabled:opacity-50">
        <Camera size={16} />
      </button>
      <button type="button" onClick={() => galleryRef.current?.click()} disabled={busy} aria-label="Elegir de galería" className="grid size-9 shrink-0 place-items-center rounded-xl border border-line text-muted transition hover:border-volt hover:text-volt active:scale-90 disabled:opacity-50">
        <Images size={16} />
      </button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPhoto(file); event.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPhoto(file); event.target.value = ""; }} />
    </div>
  );
}

/**
 * Ítem de ESCANEO: varias páginas por documento (corte de caja, vouchers,
 * depósito). Se escanean las hojas y luego se juntan en UN PDF que se manda al
 * canal de Telegram. `capture="environment"` abre la cámara trasera directo.
 */
function ScanRow({ item, busy, native = false, featured = false, onNativeScan, onCapture, onRemove, onGeneratePdf }: {
  item: ChecklistItem;
  busy: boolean;
  native?: boolean;
  featured?: boolean;
  onNativeScan?: () => void;
  onCapture: (file: File) => void;
  onRemove: (scanId: string) => void;
  onGeneratePdf: () => Promise<{ pdfUrl: string; sentToTelegram: boolean }>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; sent: boolean } | null>(null);
  const [pdfError, setPdfError] = useState("");
  const pages = item.scans.length;
  const done = pages > 0;

  // Si cambian las páginas después de generar, el PDF queda desactualizado.
  const pagesKey = item.scans.map((s) => s.id).join(",");
  useEffect(() => { setPdf(null); }, [pagesKey]);

  async function makePdf() {
    setPdfBusy(true);
    setPdfError("");
    try {
      const result = await onGeneratePdf();
      setPdf({ url: result.pdfUrl, sent: result.sentToTelegram });
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "No se pudo generar el PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  if (native) {
    return (
      <article className={`rounded-2xl bg-panel px-4 py-4 ${featured ? "shadow-[0_12px_30px_rgb(15_23_42/0.13)]" : "shadow-[0_5px_18px_rgb(15_23_42/0.07)]"}`}>
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${done ? "bg-mint/10 text-mint" : "bg-volt/10 text-volt"}`}>
            {done ? <CheckCircle2 size={19} /> : <ScrollText size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-5 text-ink">{item.label}</p>
            <p className="mt-1 text-xs leading-4 text-muted">
              {busy ? "Subiendo páginas…" : pages ? `${pages} ${pages === 1 ? "página lista" : "páginas listas"}` : "Captura todas las hojas en una sola sesión"}
            </p>
          </div>
          {done ? <Badge tone="success">{pages} pág.</Badge> : null}
        </div>

        {pages ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {item.scans.map((scan, index) => (
              <div key={scan.id} className="relative shrink-0">
                <ImagenAmpliable src={scan.url} alt={`Página ${index + 1}`}>
                  <NextImage src={scan.url} alt={`Página ${index + 1}`} width={64} height={64} className="size-16 rounded-xl object-cover" unoptimized />
                </ImagenAmpliable>
                <span className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">{index + 1}</span>
                <button type="button" onClick={() => onRemove(scan.id)} aria-label={`Borrar página ${index + 1}`} className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-orchid text-ink shadow-[0_4px_12px_rgb(225_29_72/0.3)]">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => onNativeScan ? onNativeScan() : fileRef.current?.click()}
          disabled={busy}
          className={`mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-55 focus:outline-hidden focus-visible:ring-4 focus-visible:ring-volt/30 ${featured ? "bg-volt text-white shadow-[0_7px_18px_rgb(37_99_235/0.23)]" : "bg-black/4.5 text-ink dark:bg-white/6"}`}
        >
          {busy ? <RefreshCw size={17} className="animate-spin" /> : onNativeScan ? <ScanLine size={17} /> : <Camera size={17} />}
          {busy ? "Subiendo…" : onNativeScan ? (pages ? "Agregar más páginas" : "Escanear documento") : (pages ? "Agregar otra foto" : "Tomar foto del documento")}
        </button>

        {pages ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <button type="button" onClick={() => void makePdf()} disabled={pdfBusy} className="min-h-11 text-left text-xs font-semibold text-volt disabled:opacity-50">
              {pdfBusy ? "Generando PDF…" : pdf ? "Regenerar PDF" : "Generar PDF y enviar"}
            </button>
            {pdf ? <a href={pdf.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-mint">PDF listo{pdf.sent ? " · enviado" : ""}</a> : null}
          </div>
        ) : null}
        {pdfError ? <p className="mt-2 text-xs font-semibold text-orchid">{pdfError}</p> : null}

        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onCapture(file); event.target.value = ""; }} />
      </article>
    );
  }

  return (
    <div className="py-2.5">
      <div className="flex items-center gap-3">
        <span className="shrink-0">
          {done ? <CheckCircle2 className="text-mint" size={22} /> : <Circle className="text-muted" size={22} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">{item.label}</p>
          <p className="text-[11px] text-muted">{pages ? `${pages} ${pages === 1 ? "página" : "páginas"}` : "Escanea las hojas y genera el PDF"}</p>
        </div>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-volt transition hover:border-volt active:scale-95 disabled:opacity-50">
          <Camera size={15} />{busy ? "…" : "Escanear"}
        </button>
      </div>

      {pages ? (
        <div className="mt-2 flex flex-wrap gap-2 pl-[2.1rem]">
          {item.scans.map((scan, index) => (
            <div key={scan.id} className="relative">
              <ImagenAmpliable src={scan.url} alt={`Página ${index + 1}`}>
                <NextImage src={scan.url} alt={`Página ${index + 1}`} width={56} height={56} className="size-14 rounded-lg object-cover" unoptimized />
              </ImagenAmpliable>
              <span className="absolute bottom-0 left-0 rounded-tr-md rounded-bl-lg bg-black/60 px-1 text-[9px] font-semibold text-white">{index + 1}</span>
              <button type="button" onClick={() => onRemove(scan.id)} aria-label="Borrar página" className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-orchid text-ink shadow-xs transition active:scale-90">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {pages ? (
        <div className="mt-2 flex items-center gap-2 pl-[2.1rem]">
          <button type="button" onClick={() => void makePdf()} disabled={pdfBusy} className="flex items-center gap-1.5 rounded-xl bg-volt px-3 py-2 text-xs font-semibold text-white transition hover:bg-volt/85 active:scale-95 disabled:opacity-50">
            <FileText size={15} />{pdfBusy ? "Generando…" : pdf ? "Regenerar PDF" : "Generar PDF y enviar"}
          </button>
          {pdf ? (
            <a href={pdf.url} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-mint">
              ✓ PDF listo{pdf.sent ? " · enviado a Telegram" : ""}
            </a>
          ) : null}
        </div>
      ) : null}
      {pdfError ? <p className="mt-1 pl-[2.1rem] text-[11px] font-semibold text-orchid">{pdfError}</p> : null}

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onCapture(file); event.target.value = ""; }} />
    </div>
  );
}
