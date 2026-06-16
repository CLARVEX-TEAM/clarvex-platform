"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Cake, Camera, CheckCircle2, Fingerprint, ImageUp, Moon, Store, Sun, UserRound } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { getBiometricRegistrationOptions, getSession, registerBiometric } from "@/lib/auth";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Button, Card, ProfileAvatar } from "@/components/ui";
import { SaveButton } from "@/components/ActionButtons";
import { useTheme, type Theme } from "@/components/ThemeProvider";

const roleLabels = { GERENTE: "Gerente", SUBGERENTE: "Subgerente", ASESOR: "Asesor" } as const;
const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
const maxBytes = 5 * 1024 * 1024;

export default function ProfilePage() {
  const { theme, setTheme, isDark } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricMessage, setBiometricMessage] = useState("");
  const [biometricError, setBiometricError] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [savingDates, setSavingDates] = useState(false);
  const [savedDates, setSavedDates] = useState(false);
  const [savedPhoto, setSavedPhoto] = useState(false);
  const [datesMessage, setDatesMessage] = useState("");

  useEffect(() => {
    getSession().then(setUser).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/profile")
      .then((response) => response.json() as Promise<{ birthDate?: string | null; hireDate?: string | null }>)
      .then((data) => { setBirthDate(data.birthDate ?? ""); setHireDate(data.hireDate ?? ""); })
      .catch(() => undefined);
  }, []);

  async function saveDates() {
    setSavingDates(true);
    setDatesMessage("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate: birthDate || null, hireDate: hireDate || null })
      });
      if (!response.ok) throw new Error();
      setDatesMessage("Datos guardados. 🎉");
      setSavedDates(true);
      window.setTimeout(() => setSavedDates(false), 2000);
    } catch {
      setDatesMessage("No se pudieron guardar.");
    } finally {
      setSavingDates(false);
    }
  }

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setMessage("");
    setError("");
    if (!selected) return;
    if (!acceptedTypes.includes(selected.type)) {
      setError("Usa una imagen JPG, PNG o WEBP.");
      event.target.value = "";
      return;
    }
    if (selected.size > maxBytes) {
      setError("La imagen debe pesar menos de 5 MB.");
      event.target.value = "";
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function savePhoto() {
    if (!file) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const form = new FormData();
      form.set("photo", file);
      const response = await fetch("/api/profile/photo", { method: "POST", body: form });
      const payload = await response.json() as { photoUrl?: string; error?: string };
      if (!response.ok || !payload.photoUrl) throw new Error(payload.error ?? "No se pudo guardar la foto.");
      setUser((current) => current ? { ...current, photoUrl: payload.photoUrl } : current);
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (inputRef.current) inputRef.current.value = "";
      setMessage("Foto de perfil actualizada.");
      setSavedPhoto(true);
      window.setTimeout(() => setSavedPhoto(false), 2000);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo guardar la foto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleBiometricSetup() {
    setBiometricBusy(true);
    setBiometricMessage("");
    setBiometricError("");
    try {
      const options = await getBiometricRegistrationOptions();
      const registration = await startRegistration({ optionsJSON: options });
      await registerBiometric(registration);
      setUser((current) => (current ? { ...current, biometricEnabled: true } : current));
      setBiometricMessage("Biometria activada correctamente.");
    } catch (cause) {
      setBiometricError(cause instanceof Error ? cause.message : "No se pudo activar la biometria.");
    } finally {
      setBiometricBusy(false);
    }
  }

  return (
    <>
      <AppHeader title="Mi perfil" subtitle="Tu identidad dentro de CLARVEX Team." backHref={user?.role === "ASESOR" ? "/advisor" : "/manager"} />
      <AppFrame>
        {loading ? <Card className="text-sm font-semibold text-muted">Cargando perfil...</Card> : !user ? <Card className="text-sm font-semibold text-rose-700">No fue posible cargar tu perfil.</Card> : (
          <>
            <section className="mb-3 flex flex-col items-center px-4 py-5 text-center">
              <div className="relative">
                <ProfileAvatar name={user.name} photoUrl={previewUrl ?? user.photoUrl} size="lg" className="size-28 rounded-full ring-4 ring-white dark:ring-[#2a3a5c]" />
                <button type="button" onClick={() => inputRef.current?.click()} aria-label="Cambiar foto de perfil" className="absolute bottom-0 right-0 grid size-9 place-items-center rounded-full bg-volt text-white ring-4 ring-white dark:ring-[#2a3a5c] transition active:scale-95"><Camera size={16} /></button>
              </div>
              <h2 className="mt-3 text-xl font-black text-ink">{user.name}</h2>
              <Badge>{roleLabels[user.role]}</Badge>
            </section>

            <Card className="mb-3 divide-y divide-line p-3.5">
              <ProfileField icon={<UserRound size={17} />} label="Numero de empleado" value={user.employeeNumber} />
              <ProfileField icon={<Store size={17} />} label="Tienda" value={user.storeName ?? "CLARVEX Team"} />
            </Card>

            <Card className="mb-3 p-3.5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-pink-50 dark:bg-[#2a1a2a] text-pink-500"><Cake size={19} /></span>
                <div><h2 className="font-black text-ink">Datos personales</h2><p className="text-xs text-muted">Para felicitarte en tu día 🎂</p></div>
              </div>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1">
                  <span className="text-xs font-bold text-muted">Cumpleaños</span>
                  <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt" />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-bold text-muted">Fecha de ingreso</span>
                  <input type="date" value={hireDate} onChange={(event) => setHireDate(event.target.value)} className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt" />
                </label>
                <SaveButton type="button" onClick={() => void saveDates()} loading={savingDates} success={savedDates} savedLabel="¡Guardado!">Guardar datos</SaveButton>
                {datesMessage ? <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} />{datesMessage}</p> : null}
              </div>
            </Card>

            <Card className="mb-3 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-2xl bg-slate-100 dark:bg-[#1a2540] text-muted">
                    {isDark ? <Moon size={19} /> : <Sun size={19} />}
                  </span>
                  <div>
                    <h2 className="font-black text-ink">Apariencia</h2>
                    <p className="text-xs text-muted">Tema de la aplicación</p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {(["light", "system", "dark"] as Theme[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTheme(t)}
                      className={`rounded-xl px-3 py-1.5 text-[11px] font-black transition ${theme === t ? "bg-volt text-white shadow-sm" : "bg-slate-100 dark:bg-[#1a2540] text-muted"}`}
                    >
                      {t === "light" ? "Claro" : t === "dark" ? "Oscuro" : "Auto"}
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="mb-3 p-3.5">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-blue-50 dark:bg-[#1a2540] text-volt"><ImageUp size={19} /></span><div><h2 className="font-black text-ink">Foto de perfil</h2><p className="text-xs text-muted">JPG, PNG o WEBP. Maximo 5 MB.</p></div></div>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} className="sr-only" />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button type="button" variant="ghost" onClick={() => inputRef.current?.click()} disabled={saving}>{user.photoUrl ? "Cambiar foto" : "Elegir foto"}</Button>
                <SaveButton type="button" onClick={savePhoto} disabled={!file} loading={saving} success={savedPhoto} savedLabel="¡Guardado!">Guardar foto</SaveButton>
              </div>
              {file ? <p className="mt-3 truncate text-xs font-semibold text-muted">Vista previa: {file.name}</p> : null}
              {message ? <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} />{message}</p> : null}
              {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
            </Card>

            <Card className="p-3.5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-violet-50 dark:bg-[#1a2540] text-purple"><Fingerprint size={19} /></span>
                <div><h2 className="font-black text-ink">Acceso biometrico</h2><p className="text-xs text-muted">Face ID o huella dactilar para entrar sin PIN.</p></div>
              </div>
              {user.biometricEnabled ? (
                <div className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Face ID / Huella activos</span>
                  <Badge tone="done">activo</Badge>
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  <p className="text-xs text-muted">Inicia sesion rapido con tu huella o Face ID sin escribir tu PIN.</p>
                  <Button type="button" variant="primary" onClick={() => void handleBiometricSetup()} disabled={biometricBusy}>
                    {biometricBusy ? "Activando..." : "Activar Face ID / Huella"}
                  </Button>
                  {biometricMessage ? <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 size={16} />{biometricMessage}</p> : null}
                  {biometricError ? <p className="text-sm font-semibold text-rose-700">{biometricError}</p> : null}
                </div>
              )}
            </Card>
          </>
        )}
      </AppFrame>
      <BottomNav />
    </>
  );
}

function ProfileField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="grid size-9 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-700 text-muted">{icon}</span><div><p className="text-xs font-semibold text-muted">{label}</p><p className="font-black text-ink">{value}</p></div></div>;
}
