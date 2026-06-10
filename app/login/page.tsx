"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { BadgeCheck, Camera, Fingerprint, LogIn, ShieldCheck } from "lucide-react";
import { ClarvexIcon } from "@/components/ClarvexIcon";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import {
  authenticateBiometric,
  createPin,
  getBiometricAuthOptions,
  getBiometricRegistrationOptions,
  inspectEmployee,
  loginWithPin,
  registerBiometric
} from "@/lib/auth";
import type { User } from "@/lib/types";
import { Badge, Button, ProfileAvatar } from "@/components/ui";

type Step = "employee" | "pin" | "confirm" | "profile" | "ready";

export default function LoginPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<Step>("employee");
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [requiresPinSetup, setRequiresPinSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [biometricStatus, setBiometricStatus] = useState<"idle" | "active" | "done">("idle");
  const steps = useMemo(
    () => (requiresPinSetup ? (["employee", "pin", "confirm", "profile", "ready"] as Step[]) : (["employee", "pin", "ready"] as Step[])),
    [requiresPinSetup]
  );
  const activeIndex = Math.max(0, steps.indexOf(step));

  async function nextFromEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await inspectEmployee(employeeNumber);
      setUser(result.user);
      setRequiresPinSetup(result.requiresPinSetup);
      setStep("pin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No encontre ese numero de empleado.");
    } finally {
      setBusy(false);
    }
  }

  async function finishLogin(pinValue = pin) {
    setBusy(true);
    setError("");
    try {
      const result = await loginWithPin(employeeNumber, pinValue);
      router.replace(result.user.role === "ASESOR" ? "/advisor" : "/manager");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible iniciar sesion.");
      setStep("pin");
    } finally {
      setBusy(false);
    }
  }

  function updatePin(value: string) {
    const nextPin = value.replace(/\D/g, "").slice(0, 4);
    setPin(nextPin);
    setError("");
    if (nextPin.length !== 4 || busy) return;
    if (requiresPinSetup) setStep("confirm");
    else void finishLogin(nextPin);
  }

  async function handleConfirmation(value: string) {
    const nextPin = value.replace(/\D/g, "").slice(0, 4);
    setConfirmPin(nextPin);
    if (nextPin.length !== 4 || nextPin !== pin) return;
    setBusy(true);
    setError("");
    try {
      const result = await createPin(employeeNumber, nextPin);
      setUser(result.user);
      setStep("profile");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible crear el PIN.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Solo se permiten imagenes JPG, PNG o WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("La imagen debe pesar menos de 5 MB.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const response = await fetch("/api/profile/photo", { method: "POST", body: form });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "No se pudo subir la foto.");
      }
      const payload = (await response.json()) as { photoUrl: string };
      setUser((prev) => (prev ? { ...prev, photoUrl: payload.photoUrl } : prev));
      setPhotoPreview(payload.photoUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error al subir la foto.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleBiometricSetup() {
    setBusy(true);
    setError("");
    setBiometricStatus("active");
    try {
      const options = await getBiometricRegistrationOptions();
      const registration = await startRegistration({ optionsJSON: options });
      await registerBiometric(registration);
      setUser((prev) => (prev ? { ...prev, biometricEnabled: true } : prev));
      setBiometricStatus("done");
    } catch (cause) {
      setBiometricStatus("idle");
      setError(cause instanceof Error ? cause.message : "No se pudo activar la biometria.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBiometricLogin() {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      const options = await getBiometricAuthOptions(employeeNumber);
      const authentication = await startAuthentication({ optionsJSON: options });
      const result = await authenticateBiometric(employeeNumber, authentication);
      router.replace(result.user.role === "ASESOR" ? "/advisor" : "/manager");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Autenticacion biometrica fallida.");
    } finally {
      setBusy(false);
    }
  }

  const destination = user?.role === "ASESOR" ? "/advisor" : "/manager";

  return (
    <main
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{ background: "linear-gradient(155deg, #eff6ff 0%, #dbeafe 42%, #bfdbfe 74%, #93c5fd 100%)" }}
    >
      {/* ─── Top section ─── */}
      <motion.div
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-1 flex-col items-center justify-center px-6 pb-6 pt-14"
      >
        <AnimatePresence mode="wait" initial={false}>
          {step === "pin" && user ? (
            <motion.div
              key="profile"
              initial={{ opacity: 0, scale: 0.88, y: -16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center"
            >
              <div className="size-[120px] overflow-hidden rounded-full ring-4 ring-white/80 shadow-[0_8px_32px_rgb(37_99_235_/_0.24)]">
                {user.photoUrl ? (
                  <Image src={user.photoUrl} alt={user.name} width={120} height={120} className="size-full object-cover" />
                ) : (
                  <div
                    className="size-full flex items-center justify-center text-4xl font-black text-white"
                    style={{ background: "linear-gradient(135deg, #60a5fa 0%, #1d4ed8 100%)" }}
                  >
                    {user.name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase()}
                  </div>
                )}
              </div>
              <h1 className="mt-5 text-center text-2xl font-black leading-tight tracking-[-0.02em] text-slate-900">{user.name}</h1>
              <p className="mt-1.5 text-sm font-semibold tracking-widest text-slate-400">
                {user.role === "ASESOR" ? "VENDEDOR" : user.role}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="branding"
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center"
            >
              <div className="grid size-24 place-items-center rounded-[32px] border border-white/80 bg-white/60 shadow-[0_12px_40px_rgb(37_99_235_/_0.2)] backdrop-blur-sm">
                <ClarvexIcon size={52} />
              </div>
              <p className="mt-6 text-[10px] font-black uppercase tracking-[0.45em] text-blue-500/75">CLARVEX</p>
              <h1 className="mt-1 text-[2.75rem] font-black leading-none tracking-[-0.04em] text-slate-900">TEAM</h1>
              <p className="mt-3 max-w-[200px] text-center text-sm leading-5 text-slate-500">Acceso seguro por empleado y PIN personal.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ─── Bottom sheet ─── */}
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
        className="rounded-t-[32px] border-t border-white/70 bg-white/90 px-5 pb-10 pt-6 shadow-[0_-16px_48px_rgb(37_99_235_/_0.14)] backdrop-blur-xl"
      >
        <div className={`mb-5 grid gap-2 ${requiresPinSetup ? "grid-cols-5" : "grid-cols-3"}`}>
          {steps.map((item, index) => (
            <div key={item} className={`h-1.5 rounded-full transition-colors ${index <= activeIndex ? "bg-blue-600" : "bg-slate-200"}`} />
          ))}
        </div>

        <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-3.5 py-3">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-700">
              <ShieldCheck size={15} />Acceso seguro
            </div>
            <p className="mt-0.5 text-xs text-blue-500/75">La sesion se guarda en una cookie protegida.</p>
          </div>
          <Fingerprint className="shrink-0 text-blue-400" size={20} />
        </div>

        {step === "employee" ? (
          <form className="space-y-3" onSubmit={nextFromEmployee}>
            <label className="block text-sm font-bold text-ink/75" htmlFor="employeeNumber">Numero de empleado</label>
            <input
              id="employeeNumber"
              type="tel"
              value={employeeNumber}
              onChange={(event) => { setEmployeeNumber(event.target.value.replace(/\D/g, "")); setError(""); }}
              inputMode="numeric"
              autoComplete="username"
              autoFocus
              className="min-h-14 w-full rounded-2xl border border-line/80 bg-panel/75 px-4 text-center text-xl font-black tracking-[0.18em] text-ink outline-none shadow-inner transition placeholder:text-muted/40 focus:border-volt focus:ring-4 focus:ring-volt/18"
              placeholder="81893"
            />
            {error ? <p className="text-sm font-semibold text-orchid">{error}</p> : null}
            <Button className="w-full" type="submit" variant="primary" disabled={busy || !employeeNumber}>Continuar</Button>
          </form>
        ) : null}

        {step === "pin" ? (
          <div className="space-y-4">
            <p className="text-center text-sm font-semibold text-muted">
              {requiresPinSetup ? "Crea tu PIN de primer ingreso" : "Ingresa tu PIN"}
            </p>
            <label className="grid gap-2 text-sm font-bold text-ink/75" htmlFor="pin">
              PIN de 4 digitos
              <input
                id="pin"
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete={requiresPinSetup ? "new-password" : "current-password"}
                autoFocus
                maxLength={4}
                value={pin}
                onChange={(event) => updatePin(event.target.value)}
                className="min-h-14 w-full rounded-2xl border border-line bg-panel px-4 text-center text-2xl font-black tracking-[0.65em] text-ink outline-none transition focus:border-volt focus:ring-4 focus:ring-volt/15"
                aria-describedby="pin-help"
              />
            </label>
            <p id="pin-help" className="text-center text-xs text-muted">El teclado numerico de tu dispositivo se abrira automaticamente.</p>
            {error ? <p className="text-sm font-semibold text-orchid">{error}</p> : null}
            {!requiresPinSetup && user?.biometricEnabled ? (
              <button
                type="button"
                onClick={() => void handleBiometricLogin()}
                disabled={busy}
                className="liquid-glass flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl font-bold"
              >
                <Fingerprint size={20} className="text-volt" />
                Entrar con Face ID / Huella
              </button>
            ) : null}
            <Button
              className="w-full"
              variant="primary"
              disabled={busy || pin.length < 4}
              onClick={() => requiresPinSetup ? setStep("confirm") : void finishLogin()}
            >
              {requiresPinSetup ? "Guardar PIN" : "Entrar"}
            </Button>
          </div>
        ) : null}

        {step === "confirm" ? (
          <div className="space-y-4">
            <div><h2 className="text-xl font-black">Confirma tu PIN</h2><p className="mt-1 text-sm text-muted">Debe coincidir con el PIN anterior.</p></div>
            <label className="grid gap-2 text-sm font-bold text-ink/75" htmlFor="confirmPin">
              Repite tu PIN
              <input
                id="confirmPin"
                name="confirmPin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="new-password"
                autoFocus
                maxLength={4}
                value={confirmPin}
                onChange={(event) => void handleConfirmation(event.target.value)}
                className="min-h-14 w-full rounded-2xl border border-line bg-panel px-4 text-center text-2xl font-black tracking-[0.65em] text-ink outline-none transition focus:border-volt focus:ring-4 focus:ring-volt/15"
              />
            </label>
            {confirmPin.length === 4 && confirmPin !== pin ? <p className="text-sm font-semibold text-orchid">Los PIN no coinciden.</p> : null}
            {error ? <p className="text-sm font-semibold text-orchid">{error}</p> : null}
            <Button
              className="w-full"
              variant="primary"
              disabled={busy || confirmPin.length < 4 || confirmPin !== pin}
              onClick={() => void handleConfirmation(confirmPin)}
            >
              {busy ? "Guardando..." : "Confirmar PIN"}
            </Button>
          </div>
        ) : null}

        {step === "profile" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <ProfileAvatar name={user?.name ?? "CL"} photoUrl={photoPreview ?? user?.photoUrl} size="lg" />
              <div>
                <h2 className="text-xl font-black">{user?.name}</h2>
                <p className="mt-1 text-sm text-muted">Personaliza tu perfil.</p>
              </div>
            </div>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="liquid-glass flex min-h-14 items-center justify-between rounded-2xl px-4 text-left"
              >
                <span className="flex items-center gap-3 font-bold"><Camera className="text-sky" size={18} /> Agregar foto de perfil</span>
                {photoPreview ? <Badge tone="done">guardada</Badge> : <Badge tone="info">opcional</Badge>}
              </button>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void handlePhotoChange(e)} />
              {biometricStatus === "done" ? (
                <div className="liquid-glass flex min-h-14 items-center justify-between rounded-2xl px-4">
                  <span className="flex items-center gap-3 font-bold"><Fingerprint className="text-volt" size={18} /> Biometria activada</span>
                  <Badge tone="done">activa</Badge>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleBiometricSetup()}
                  disabled={busy}
                  className="liquid-glass flex min-h-14 items-center justify-between rounded-2xl px-4 text-left"
                >
                  <span className="flex items-center gap-3 font-bold">
                    <Fingerprint className="text-purple" size={18} />
                    {biometricStatus === "active" ? "Activando..." : "Activar Face ID / Huella"}
                  </span>
                  <Badge tone={biometricStatus === "active" ? "info" : undefined}>
                    {biometricStatus === "active" ? "espera" : "opcional"}
                  </Badge>
                </button>
              )}
            </div>
            {error ? <p className="text-sm font-semibold text-orchid">{error}</p> : null}
            <Button className="w-full" variant="primary" onClick={() => setStep("ready")}>Continuar</Button>
          </div>
        ) : null}

        {step === "ready" ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-[1.35rem] border border-volt/30 bg-volt/15 text-volt"><BadgeCheck size={28} /></div>
            <div>
              <h2 className="text-2xl font-black">Listo para operar</h2>
              <p className="mt-2 text-sm text-muted">Tu PIN esta guardado y tu sesion esta activa.</p>
            </div>
            {error ? <p className="text-sm font-semibold text-orchid">{error}</p> : null}
            <Button
              className="w-full"
              variant="primary"
              icon={<LogIn size={17} />}
              onClick={() => { router.replace(destination); router.refresh(); }}
            >
              Entrar a CLARVEX
            </Button>
          </div>
        ) : null}

        {step === "pin" && !requiresPinSetup ? (
          <p className="mt-4 text-center text-xs text-muted">
            Olvidaste tu PIN? Contacta al administrador de tu tienda.
          </p>
        ) : null}
      </motion.div>
    </main>
  );
}
