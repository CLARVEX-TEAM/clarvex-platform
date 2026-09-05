"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Cake, Camera, Fingerprint, ImageUp, Moon, Store, Sun, UserRound } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { getBiometricRegistrationOptions, getSession, registerBiometric } from "@/lib/auth";
import type { User, Role } from "@/lib/types";
import { Badge, ProfileAvatar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import {
  DeskButton, DeskPanel, DeskPrimaryButton, DeskReveal, DeskSection, DeskSkeleton, deskInput
} from "@/components/desktop/DeskUI";

/**
 * ⚠️ **Tiene que cubrir TODOS los roles.** Faltaba `REGIONAL`, asi que a una
 * persona con ese rol se le pintaba la insignia VACIA: `roleLabels[user.role]`
 * devolvia `undefined` y nadie se enteraba.
 *
 * El tipo `Record<Role, string>` es lo que lo impide: si manana se anade un rol
 * al tipo, esto deja de compilar hasta que alguien decida como se llama.
 */
const roleLabels: Record<Role, string> = {
  GERENTE: "Gerente",
  SUBGERENTE: "Subgerente",
  ASESOR: "Asesor",
  REGIONAL: "Regional"
};
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

  if (loading) {
    return (
      <div className="grid gap-10 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <DeskSkeleton className="h-96" />
        <div className="space-y-4">{[0, 1, 2].map((i) => <DeskSkeleton key={i} className="h-32" />)}</div>
      </div>
    );
  }
  if (!user) {
    return (
      <p role="alert" className="rounded-xl border border-danger/30 bg-danger/[0.07] px-4 py-3 text-ui text-danger">
        No fue posible cargar tu perfil.
      </p>
    );
  }

  return (
    <div className="grid gap-10 xl:grid-cols-[20rem_minmax(0,1fr)]">
      {/* Identidad */}
      <DeskReveal index={0}>
        <div className="xl:sticky xl:top-20">
          <DeskPanel className="text-center">
            <div className="relative mx-auto w-fit">
              <ProfileAvatar
                name={user.name}
                photoUrl={previewUrl ?? user.photoUrl}
                size="lg"
                className="size-28 rounded-2xl ring-1 ring-line"
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                aria-label="Cambiar foto de perfil"
                className="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-xl bg-accent text-on-accent ring-4 ring-[rgb(var(--color-card))]"
              >
                <Camera size={16} />
              </button>
            </div>

            <h2 className="mt-4 text-lead font-semibold text-ink">{user.name}</h2>
            <div className="mt-1 flex justify-center"><Badge>{roleLabels[user.role]}</Badge></div>

            <dl className="mt-6 text-left">
              <ProfileField icon={<UserRound size={16} />} label="Número de empleado" value={user.employeeNumber} />
              <ProfileField icon={<Store size={16} />} label="Tienda" value={user.storeName ?? "CLARVEX Team"} />
            </dl>
          </DeskPanel>
        </div>
      </DeskReveal>

      {/* Ajustes */}
      <DeskReveal index={1}>
        <div className="grid gap-8 2xl:grid-cols-2">
          <DeskSection title="Datos personales" hint="Sirven para felicitarte en tu cumpleaños y tu aniversario.">
            <DeskPanel>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="flex items-center gap-1.5 text-caption font-medium text-muted"><Cake size={13} /> Cumpleaños</span>
                  <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className={deskInput} />
                </label>
                <label className="grid gap-1">
                  <span className="text-caption font-medium text-muted">Fecha de ingreso</span>
                  <input type="date" value={hireDate} onChange={(event) => setHireDate(event.target.value)} className={deskInput} />
                </label>
              </div>
              <div className="mt-3">
                <DeskButton type="button" onClick={() => void saveDates()} disabled={savingDates}>
                  {savingDates ? "Guardando…" : savedDates ? "¡Guardado!" : "Guardar datos"}
                </DeskButton>
              </div>
            </DeskPanel>
          </DeskSection>

          <DeskSection title="Apariencia" hint="El escritorio arranca en oscuro; aquí lo cambias para siempre.">
            <DeskPanel>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-ui text-ink">
                  {isDark ? <Moon size={16} className="text-muted" /> : <Sun size={16} className="text-muted" />}
                  Tema de la aplicación
                </span>
                <div className="flex gap-1.5" role="group" aria-label="Tema">
                  {(["light", "system", "dark"] as Theme[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTheme(t)}
                      aria-pressed={theme === t}
                      className={`min-h-8 rounded-lg px-2.5 text-caption font-medium transition-colors ${
                        theme === t ? "bg-accent text-on-accent" : "border border-line bg-panel text-muted hover:text-ink"
                      }`}
                    >
                      {t === "light" ? "Claro" : t === "dark" ? "Oscuro" : "Auto"}
                    </button>
                  ))}
                </div>
              </div>
            </DeskPanel>
          </DeskSection>

          <DeskSection title="Foto de perfil" hint="JPG, PNG o WEBP. Máximo 5 MB. Se sube sola al elegirla.">
            <DeskPanel>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} className="sr-only" />
              <DeskButton type="button" onClick={() => inputRef.current?.click()} disabled={saving} className="w-full">
                <ImageUp size={15} />
                {saving ? "Subiendo…" : user.photoUrl ? "Cambiar foto" : "Elegir foto"}
              </DeskButton>
            </DeskPanel>
          </DeskSection>

          <DeskSection title="Acceso biométrico" hint="Face ID o huella para entrar sin escribir el PIN.">
            <DeskPanel>
              {user.biometricEnabled ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-ok/30 bg-ok/[0.08] px-4 py-3">
                  <span className="flex items-center gap-2 text-ui font-medium text-ok">
                    <Fingerprint size={16} /> Face ID / Huella activos
                  </span>
                  <Badge tone="done">activo</Badge>
                </div>
              ) : (
                <DeskPrimaryButton type="button" onClick={() => void handleBiometricSetup()} disabled={biometricBusy}>
                  <Fingerprint size={15} />
                  {biometricBusy ? "Activando…" : "Activar Face ID / Huella"}
                </DeskPrimaryButton>
              )}
            </DeskPanel>
          </DeskSection>
        </div>
      </DeskReveal>
    </div>
  );
}

function ProfileField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-panel text-muted">{icon}</span>
      <div className="min-w-0">
        <dt className="text-caption text-muted">{label}</dt>
        <dd className="truncate text-ui text-ink">{value}</dd>
      </div>
    </div>
  );
}
