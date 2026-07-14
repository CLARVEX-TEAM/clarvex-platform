"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Cake, Camera, Fingerprint, ImageUp, Moon, Store, Sun, UserRound } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { getBiometricRegistrationOptions, getSession, registerBiometric } from "@/lib/auth";
import type { User } from "@/lib/types";
import { Badge, Button, Card, ProfileAvatar } from "@/components/ui";
import { SaveButton } from "@/components/ActionButtons";
import { useToast } from "@/components/Toast";
import { useTheme, type Theme } from "@/components/ThemeProvider";

const roleLabels = { GERENTE: "Gerente", SUBGERENTE: "Subgerente", ASESOR: "Asesor" } as const;
const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
const maxBytes = 5 * 1024 * 1024;

export default function EscritorioPerfil() {
  const { theme, setTheme, isDark } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [savingDates, setSavingDates] = useState(false);
  const [savedDates, setSavedDates] = useState(false);

  useEffect(() => {
    getSession().then(setUser).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/profile")
      .then((response) => response.json() as Promise<{ birthDate?: string | null; hireDate?: string | null }>)
      .then((data) => { setBirthDate(data.birthDate ?? ""); setHireDate(data.hireDate ?? ""); })
      .catch(() => undefined);
  }, []);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function saveDates() {
    setSavingDates(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate: birthDate || null, hireDate: hireDate || null })
      });
      if (!response.ok) throw new Error();
      toast("Datos guardados.", "success");
      setSavedDates(true);
      window.setTimeout(() => setSavedDates(false), 2000);
    } catch {
      toast("No se pudieron guardar.", "error");
    } finally {
      setSavingDates(false);
    }
  }

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    if (!acceptedTypes.includes(selected.type)) { toast("Usa una imagen JPG, PNG o WEBP.", "error"); event.target.value = ""; return; }
    if (selected.size > maxBytes) { toast("La imagen debe pesar menos de 5 MB.", "error"); event.target.value = ""; return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(selected));
    // Se sube SOLA. Antes había un botón "Guardar foto" aparte, y en esta misma
    // pantalla otro "Guardar datos": ambos decían "¡Guardado!". Con el preview
    // local mostrando ya la foto nueva, era facilísimo pulsar el equivocado,
    // ver el verde, e irse sin haber subido nada.
    void savePhoto(selected);
  }

  // Recibe el File directo: el estado de React todavía no lo tendría.
  async function savePhoto(selected: File) {
    setSaving(true);
    try {
      const form = new FormData();
      form.set("photo", selected);
      const response = await fetch("/api/profile/photo", { method: "POST", body: form });
      const payload = await response.json() as { photoUrl?: string; error?: string };
      if (!response.ok || !payload.photoUrl) throw new Error(payload.error ?? "No se pudo guardar la foto.");
      setUser((current) => current ? { ...current, photoUrl: payload.photoUrl } : current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (inputRef.current) inputRef.current.value = "";
      toast("Foto de perfil actualizada.", "success");
    } catch (uploadError) {
      // Falló: se quita el preview para no dejar una foto que NO se guardó.
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (inputRef.current) inputRef.current.value = "";
      toast(uploadError instanceof Error ? uploadError.message : "No se pudo guardar la foto.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleBiometricSetup() {
    setBiometricBusy(true);
    try {
      const options = await getBiometricRegistrationOptions();
      const registration = await startRegistration({ optionsJSON: options });
      await registerBiometric(registration);
      setUser((current) => (current ? { ...current, biometricEnabled: true } : current));
      toast("Biometría activada correctamente.", "success");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "No se pudo activar la biometría.", "error");
    } finally {
      setBiometricBusy(false);
    }
  }

  if (loading) return <Card className="text-sm font-semibold text-muted">Cargando perfil…</Card>;
  if (!user) return <Card className="text-sm font-semibold text-rose-700">No fue posible cargar tu perfil.</Card>;

  return (
    <div className="grid grid-cols-3 gap-5">
      {/* Identidad */}
      <Card className="col-span-1 h-fit p-6 text-center">
        <div className="relative mx-auto w-fit">
          <ProfileAvatar name={user.name} photoUrl={previewUrl ?? user.photoUrl} size="lg" className="size-32 rounded-full ring-4 ring-white dark:ring-[#2a3a5c]" />
          <button type="button" onClick={() => inputRef.current?.click()} aria-label="Cambiar foto de perfil" className="absolute bottom-1 right-1 grid size-9 place-items-center rounded-full bg-volt text-white ring-4 ring-white dark:ring-[#2a3a5c] transition active:scale-95"><Camera size={16} /></button>
        </div>
        <h2 className="mt-4 text-xl font-black text-ink">{user.name}</h2>
        <div className="mt-1 flex justify-center"><Badge>{roleLabels[user.role]}</Badge></div>

        <div className="mt-5 divide-y divide-line text-left">
          <ProfileField icon={<UserRound size={17} />} label="Número de empleado" value={user.employeeNumber} />
          <ProfileField icon={<Store size={17} />} label="Tienda" value={user.storeName ?? "CLARVEX Team"} />
        </div>
      </Card>

      {/* Ajustes */}
      <div className="col-span-2 space-y-4">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-pink-50 text-pink-500 dark:bg-[#2a1a2a]"><Cake size={19} /></span>
            <div><h2 className="font-black text-ink">Datos personales</h2><p className="text-xs text-muted">Para felicitarte en tu día 🎂</p></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-bold text-muted">Cumpleaños</span>
              <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-bold text-muted">Fecha de ingreso</span>
              <input type="date" value={hireDate} onChange={(event) => setHireDate(event.target.value)} className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt" />
            </label>
          </div>
          <div className="mt-3"><SaveButton type="button" onClick={() => void saveDates()} loading={savingDates} success={savedDates} savedLabel="¡Guardado!">Guardar datos</SaveButton></div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-slate-100 text-muted dark:bg-[#1a2540]">{isDark ? <Moon size={19} /> : <Sun size={19} />}</span>
              <div><h2 className="font-black text-ink">Apariencia</h2><p className="text-xs text-muted">Tema de la aplicación</p></div>
            </div>
            <div className="flex gap-1.5">
              {(["light", "system", "dark"] as Theme[]).map((t) => (
                <button key={t} type="button" onClick={() => setTheme(t)} className={`rounded-xl px-3 py-1.5 text-[11px] font-black transition ${theme === t ? "bg-volt text-white shadow-sm" : "bg-slate-100 text-muted dark:bg-[#1a2540]"}`}>
                  {t === "light" ? "Claro" : t === "dark" ? "Oscuro" : "Auto"}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-blue-50 text-volt dark:bg-[#1a2540]"><ImageUp size={19} /></span><div><h2 className="font-black text-ink">Foto de perfil</h2><p className="text-xs text-muted">JPG, PNG o WEBP. Máximo 5 MB.</p></div></div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} className="sr-only" />
          {/* Sin botón de guardar: al elegir la imagen se sube sola. */}
          <div className="mt-4">
            <Button type="button" variant="ghost" onClick={() => inputRef.current?.click()} disabled={saving} className="w-full">
              {saving ? "Subiendo…" : user.photoUrl ? "Cambiar foto" : "Elegir foto"}
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-violet-50 text-purple dark:bg-[#1a2540]"><Fingerprint size={19} /></span>
            <div><h2 className="font-black text-ink">Acceso biométrico</h2><p className="text-xs text-muted">Face ID o huella dactilar para entrar sin PIN.</p></div>
          </div>
          {user.biometricEnabled ? (
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Face ID / Huella activos</span>
              <Badge tone="done">activo</Badge>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              <p className="text-xs text-muted">Inicia sesión rápido con tu huella o Face ID sin escribir tu PIN.</p>
              <Button type="button" variant="primary" onClick={() => void handleBiometricSetup()} disabled={biometricBusy} className="w-fit">
                {biometricBusy ? "Activando…" : "Activar Face ID / Huella"}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ProfileField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="grid size-9 place-items-center rounded-2xl bg-slate-100 text-muted dark:bg-slate-700">{icon}</span><div><p className="text-xs font-semibold text-muted">{label}</p><p className="font-black text-ink">{value}</p></div></div>;
}
