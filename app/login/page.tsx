"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { BadgeCheck, Camera, Delete, Fingerprint, LogIn, ShieldCheck } from "lucide-react";
import { ClarvexIcon } from "@/components/ClarvexIcon";
import { ParticleBackground } from "@/components/ParticleBackground";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import {
  authenticateBiometric,
  createPin,
  getBiometricAuthOptions,
  getBiometricRegistrationOptions,
  inspectEmployee,
  loginWithPin,
  registerBiometric,
} from "@/lib/auth";
import type { User } from "@/lib/types";
import { Badge, Button, ProfileAvatar } from "@/components/ui";

type Step = "employee" | "greeting" | "pin" | "confirm" | "profile" | "ready";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: "Buenos días", emoji: "👋" };
  if (h < 18) return { text: "Buenas tardes", emoji: "☀️" };
  return { text: "Buenas noches", emoji: "🌙" };
}

function PinDots({ filled }: { filled: number }) {
  return (
    <div className="flex justify-center gap-5 py-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div
          key={i}
          animate={i === filled - 1 && filled > 0 ? { scale: [1, 1.4, 1] } : { scale: 1 }}
          transition={{ duration: 0.18 }}
          className={`size-[18px] rounded-full transition-colors duration-150 ${
            i < filled
              ? "bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.6)]"
              : "bg-slate-200 dark:bg-slate-700"
          }`}
        />
      ))}
    </div>
  );
}

function NumPad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;
  return (
    <div className="grid grid-cols-3 gap-3 px-6">
      {keys.map((k, i) => {
        if (k === "") return <div key={`empty-${i}`} />;
        return (
          <motion.button
            key={k}
            type="button"
            whileTap={{ scale: 0.85 }}
            onPointerDown={(e) => {
              e.preventDefault();
              onKey(k);
            }}
            className={`h-[4.25rem] select-none rounded-2xl text-xl font-bold transition-colors ${
              k === "del"
                ? "flex items-center justify-center text-slate-400 dark:text-slate-500"
                : "bg-white/80 text-slate-900 shadow-sm backdrop-blur-sm dark:bg-slate-800/80 dark:text-white"
            }`}
          >
            {k === "del" ? <Delete size={22} /> : k}
          </motion.button>
        );
      })}
    </div>
  );
}

const cardLight = "border border-white/70 bg-white/90 shadow-[0_20px_60px_rgba(37,99,235,0.13)] backdrop-blur-xl";
const cardDark = "border border-white/8 bg-slate-900/90 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl";

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
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const steps = useMemo(
    () =>
      requiresPinSetup
        ? (["employee", "pin", "confirm", "profile", "ready"] as Step[])
        : (["employee", "greeting", "pin"] as Step[]),
    [requiresPinSetup]
  );
  void steps; // used only for flow logic reference

  // ─── Auth handlers (logic sin cambios) ────────────────────────────

  async function nextFromEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await inspectEmployee(employeeNumber);
      setUser(result.user);
      setRequiresPinSetup(result.requiresPinSetup);
      setStep(result.requiresPinSetup ? "pin" : "greeting");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No encontré ese número de empleado.");
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
      setError(cause instanceof Error ? cause.message : "No fue posible iniciar sesión.");
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

  function handlePinKey(k: string) {
    if (k === "del") {
      setPin((p) => p.slice(0, -1));
      setError("");
    } else {
      updatePin(pin + k);
    }
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

  function handleConfirmKey(k: string) {
    if (k === "del") {
      setConfirmPin((p) => p.slice(0, -1));
      setError("");
    } else {
      void handleConfirmation(confirmPin + k);
    }
  }

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Solo se permiten imágenes JPG, PNG o WEBP.");
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
      setError(cause instanceof Error ? cause.message : "No se pudo activar la biometría.");
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
      setError(cause instanceof Error ? cause.message : "Autenticación biométrica fallida.");
    } finally {
      setBusy(false);
    }
  }

  const destination = user?.role === "ASESOR" ? "/advisor" : "/manager";
  const greeting = getGreeting();
  const card = isDark ? cardDark : cardLight;

  return (
    <main
      className="relative min-h-screen overflow-hidden"
      style={
        isDark
          ? { background: "#0f1729" }
          : { background: "linear-gradient(155deg, #eff6ff 0%, #dbeafe 42%, #bfdbfe 74%, #93c5fd 100%)" }
      }
    >
      <ParticleBackground dark={isDark} />

      <div className="relative z-10">
        <AnimatePresence mode="wait" initial={false}>

          {/* ════════════════════════════════════════════
              PANTALLA 1 — Número de empleado
          ════════════════════════════════════════════ */}
          {step === "employee" && (
            <motion.div
              key="employee"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-screen flex-col items-center justify-center px-5 py-10"
            >
              {/* Logo circular */}
              <motion.div
                initial={{ opacity: 0, scale: 0.75 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="mb-10 flex flex-col items-center"
              >
                <div
                  className="flex size-[80px] items-center justify-center rounded-full shadow-[0_12px_40px_rgba(37,99,235,0.38)]"
                  style={{ background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" }}
                >
                  <ClarvexIcon size={44} />
                </div>
                <p className="mt-3 text-[11px] font-black tracking-[0.42em] text-blue-600">CLARVEX TEAM</p>
              </motion.div>

              {/* Card */}
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className={`w-full max-w-sm rounded-3xl p-6 ${card}`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <ShieldCheck className="text-blue-600" size={16} />
                  <span className="text-sm font-black text-blue-700">Acceso seguro</span>
                </div>
                <p className={`mb-6 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Ingresa tu número de empleado
                </p>

                <form className="space-y-4" onSubmit={nextFromEmployee}>
                  <input
                    type="tel"
                    value={employeeNumber}
                    onChange={(e) => {
                      setEmployeeNumber(e.target.value.replace(/\D/g, ""));
                      setError("");
                    }}
                    inputMode="numeric"
                    autoComplete="username"
                    autoFocus
                    placeholder="ej. 81893"
                    className={`min-h-14 w-full rounded-2xl border px-4 text-center text-xl font-black tracking-[0.18em] outline-none shadow-inner transition placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 ${
                      isDark
                        ? "border-slate-700 bg-slate-800 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-900"
                    }`}
                  />
                  {error ? <p className="text-sm font-semibold text-red-500">{error}</p> : null}
                  <Button
                    className="w-full rounded-2xl"
                    type="submit"
                    variant="primary"
                    loading={busy}
                    disabled={busy || !employeeNumber}
                  >
                    Continuar
                  </Button>
                </form>
              </motion.div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════
              PANTALLA 2 — Saludo y perfil del usuario
          ════════════════════════════════════════════ */}
          {step === "greeting" && user ? (
            <motion.div
              key="greeting"
              initial={{ opacity: 0, x: 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -48 }}
              transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-screen flex-col items-center px-5 pb-10 pt-16"
            >
              {/* Foto con glow */}
              <div className="relative mb-5">
                <div
                  className="absolute inset-0 rounded-full blur-3xl"
                  style={{ background: "rgba(59,130,246,0.42)", transform: "scale(1.35)" }}
                />
                <div className="relative size-[112px] overflow-hidden rounded-full ring-4 ring-white/80 shadow-2xl">
                  {user.photoUrl ? (
                    <Image
                      src={user.photoUrl}
                      alt={user.name}
                      width={112}
                      height={112}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex size-full items-center justify-center text-3xl font-black text-white"
                      style={{ background: "linear-gradient(135deg, #60a5fa 0%, #1d4ed8 100%)" }}
                    >
                      {user.name
                        .split(" ")
                        .slice(0, 2)
                        .map((w) => w[0] ?? "")
                        .join("")
                        .toUpperCase()}
                    </div>
                  )}
                </div>
              </div>

              {/* Saludo dinámico */}
              <p className={`text-base font-semibold ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                {greeting.text} {greeting.emoji}
              </p>
              <h1 className={`mt-1 text-2xl font-black tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                {user.name}
              </h1>
              <p className={`mt-1 text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {user.role === "ASESOR" ? "Vendedor" : user.role}
                {user.storeName ? ` · ${user.storeName}` : ""}
              </p>

              {/* Resumen de hoy */}
              <div className={`mt-6 w-full max-w-sm rounded-3xl p-4 ${card}`}>
                <p
                  className={`mb-3 text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"}`}
                >
                  Resumen de hoy
                </p>
                <div
                  className={`grid grid-cols-3 divide-x ${isDark ? "divide-slate-700" : "divide-slate-100"}`}
                >
                  {[
                    { label: "Venta actual", value: "—" },
                    { label: "Conversión", value: "—" },
                    { label: "Meta del día", value: "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col items-center px-2 text-center">
                      <span className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>
                        {value}
                      </span>
                      <span
                        className={`mt-1 text-[10px] font-medium leading-snug ${isDark ? "text-slate-500" : "text-slate-400"}`}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botón biometría (si tiene registrada) */}
              {user.biometricEnabled ? (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => void handleBiometricLogin()}
                  disabled={busy}
                  className="mt-6 flex min-h-[3.5rem] w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-blue-600 text-[15px] font-black text-white shadow-[0_8px_24px_rgba(37,99,235,0.38)] transition disabled:opacity-60"
                >
                  🔒 Entrar con Huella
                </motion.button>
              ) : null}

              {/* Separador */}
              <div className="mt-5 flex w-full max-w-sm items-center gap-3">
                <div className={`h-px flex-1 ${isDark ? "bg-slate-700" : "bg-slate-200"}`} />
                <span className={`text-xs font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                  o usa tu PIN
                </span>
                <div className={`h-px flex-1 ${isDark ? "bg-slate-700" : "bg-slate-200"}`} />
              </div>

              {/* Botón PIN outline */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => setStep("pin")}
                className={`mt-4 flex min-h-[3.5rem] w-full max-w-sm items-center justify-center gap-2 rounded-2xl border-2 text-[15px] font-black transition ${
                  isDark ? "border-slate-700 text-slate-200" : "border-blue-200 text-blue-700"
                }`}
              >
                🔑 Entrar con PIN
              </motion.button>

              {error ? <p className="mt-3 text-sm font-semibold text-red-500">{error}</p> : null}
            </motion.div>
          ) : null}

          {/* ════════════════════════════════════════════
              PANTALLA 3 — Ingreso de PIN (teclado custom)
          ════════════════════════════════════════════ */}
          {step === "pin" ? (
            <motion.div
              key="pin"
              initial={{ opacity: 0, x: 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -48 }}
              transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-screen flex-col"
            >
              {/* Sección superior */}
              <div className="flex flex-1 flex-col items-center justify-center px-5 pt-10">
                {/* Logo pequeño */}
                <div
                  className="mb-4 flex size-[60px] items-center justify-center rounded-full shadow-[0_8px_24px_rgba(37,99,235,0.32)]"
                  style={{ background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" }}
                >
                  <ClarvexIcon size={34} />
                </div>
                <p className="mb-5 text-[10px] font-black tracking-[0.42em] text-blue-600">CLARVEX TEAM</p>

                {/* Card con dots */}
                <div className={`w-full max-w-sm rounded-3xl p-6 ${card}`}>
                  <div className="mb-1 flex items-center gap-2">
                    <ShieldCheck className="text-blue-600" size={16} />
                    <span className="text-sm font-black text-blue-700">Acceso seguro</span>
                  </div>
                  <p className={`mb-6 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {requiresPinSetup ? "Crea tu PIN personal de 4 dígitos" : "Ingresa tu PIN personal"}
                  </p>

                  <PinDots filled={pin.length} />

                  {error ? <p className="mt-3 text-center text-sm font-semibold text-red-500">{error}</p> : null}

                  {!requiresPinSetup ? (
                    <p className={`mt-4 text-center text-xs ${isDark ? "text-slate-600" : "text-slate-400"}`}>
                      ¿Olvidaste tu PIN? Contacta al administrador
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Teclado numérico custom */}
              <div className="pb-10 pt-5">
                <NumPad onKey={handlePinKey} />
              </div>
            </motion.div>
          ) : null}

          {/* ════════════════════════════════════════════
              CONFIRM — Confirmar PIN (primer ingreso)
          ════════════════════════════════════════════ */}
          {step === "confirm" ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -48 }}
              transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-screen flex-col"
            >
              <div className="flex flex-1 flex-col items-center justify-center px-5 pt-10">
                <div
                  className="mb-4 flex size-[60px] items-center justify-center rounded-full shadow-[0_8px_24px_rgba(37,99,235,0.32)]"
                  style={{ background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" }}
                >
                  <ClarvexIcon size={34} />
                </div>
                <p className="mb-5 text-[10px] font-black tracking-[0.42em] text-blue-600">CLARVEX TEAM</p>

                <div className={`w-full max-w-sm rounded-3xl p-6 ${card}`}>
                  <h2 className={`mb-1 text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>
                    Confirma tu PIN
                  </h2>
                  <p className={`mb-6 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Ingresa el mismo PIN de nuevo
                  </p>

                  <PinDots filled={confirmPin.length} />

                  {confirmPin.length === 4 && confirmPin !== pin ? (
                    <p className="mt-3 text-center text-sm font-semibold text-red-500">Los PIN no coinciden</p>
                  ) : null}
                  {error ? <p className="mt-2 text-center text-sm font-semibold text-red-500">{error}</p> : null}
                </div>
              </div>

              <div className="pb-10 pt-5">
                <NumPad onKey={handleConfirmKey} />
              </div>
            </motion.div>
          ) : null}

          {/* ════════════════════════════════════════════
              PROFILE — Foto + biometría (primer ingreso)
          ════════════════════════════════════════════ */}
          {step === "profile" ? (
            <motion.div
              key="profile-setup"
              initial={{ opacity: 0, x: 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -48 }}
              transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-screen flex-col items-center justify-center px-5 py-10"
            >
              <div className={`w-full max-w-sm rounded-3xl p-6 ${card}`}>
                <div className="mb-5 flex items-center gap-4">
                  <ProfileAvatar name={user?.name ?? "CL"} photoUrl={photoPreview ?? user?.photoUrl} size="lg" />
                  <div>
                    <h2 className={`text-xl font-black ${isDark ? "text-white" : "text-slate-900"}`}>
                      {user?.name}
                    </h2>
                    <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Personaliza tu perfil
                    </p>
                  </div>
                </div>

                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    className="liquid-glass flex min-h-14 items-center justify-between rounded-2xl px-4 text-left"
                  >
                    <span className="flex items-center gap-3 font-bold">
                      <Camera className="text-sky" size={18} />
                      Agregar foto de perfil
                    </span>
                    {photoPreview ? <Badge tone="done">guardada</Badge> : <Badge tone="info">opcional</Badge>}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => void handlePhotoChange(e)}
                  />

                  {biometricStatus === "done" ? (
                    <div className="liquid-glass flex min-h-14 items-center justify-between rounded-2xl px-4">
                      <span className="flex items-center gap-3 font-bold">
                        <Fingerprint className="text-volt" size={18} />
                        Biometría activada
                      </span>
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

                {error ? <p className="mt-3 text-sm font-semibold text-red-500">{error}</p> : null}
                <Button
                  className="mt-5 w-full rounded-2xl"
                  variant="primary"
                  onClick={() => setStep("ready")}
                >
                  Continuar
                </Button>
              </div>
            </motion.div>
          ) : null}

          {/* ════════════════════════════════════════════
              READY — Listo para operar
          ════════════════════════════════════════════ */}
          {step === "ready" ? (
            <motion.div
              key="ready"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-screen flex-col items-center justify-center px-5"
            >
              <div className={`w-full max-w-sm rounded-3xl p-8 text-center ${card}`}>
                <div className="mx-auto mb-5 grid size-16 place-items-center rounded-[1.35rem] border border-green-500/30 bg-green-500/15 text-green-500">
                  <BadgeCheck size={28} />
                </div>
                <h2 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-900"}`}>
                  Listo para operar
                </h2>
                <p className={`mt-2 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Tu PIN está guardado y tu sesión está activa.
                </p>
                {error ? <p className="mt-3 text-sm font-semibold text-red-500">{error}</p> : null}
                <Button
                  className="mt-6 w-full rounded-2xl"
                  variant="primary"
                  icon={<LogIn size={17} />}
                  onClick={() => {
                    router.replace(destination);
                    router.refresh();
                  }}
                >
                  Entrar a CLARVEX
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </main>
  );
}
