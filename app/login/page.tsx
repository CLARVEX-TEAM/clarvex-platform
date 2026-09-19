"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { Moon, Sparkles, Sun } from "lucide-react";
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
  type PreAuthUser,
} from "@/lib/auth";
import type { User } from "@/lib/types";
import { useTheme } from "@/components/ThemeProvider";
import { markDesktopFreshLogin, saveProfileWithAvatar } from "@/lib/desktop-profiles";

import { EmployeeStep } from "./EmployeeStep";
import { GreetingStep } from "./GreetingStep";
import { PinStep } from "./PinStep";
import { ConfirmStep } from "./ConfirmStep";
import { ProfileStep } from "./ProfileStep";
import { ReadyStep } from "./ReadyStep";
import { EmailStep } from "./EmailStep";
import { enContenedorNativo } from "@/lib/puente-nativo";
import { portadaDe } from "@/lib/portada";

type Step = "employee" | "greeting" | "pin" | "confirm" | "profile" | "ready" | "email";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: "Buenos días", Icon: Sparkles };
  if (h < 18) return { text: "Buenas tardes", Icon: Sun };
  return { text: "Buenas noches", Icon: Moon };
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
  // `lookup`: lo poco que se sabe ANTES de autenticar (solo el saludo).
  // `user`: el usuario completo, ya autenticado. No se mezclan a propósito.
  const [lookup, setLookup] = useState<PreAuthUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [requiresPinSetup, setRequiresPinSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [biometricStatus, setBiometricStatus] = useState<"idle" | "active" | "done">("idle");
  const { isDark } = useTheme();
  // En escritorio (pantalla grande con mouse) no mostramos el teclado en
  // pantalla: el PIN se escribe con el teclado físico de la computadora.
  const [physicalKeyboard, setPhysicalKeyboard] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px) and (pointer: fine)");
    const update = () => setPhysicalKeyboard(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Permite escribir el PIN con el teclado físico en cualquier dispositivo.
  useEffect(() => {
    if (step !== "pin" && step !== "confirm") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key >= "0" && event.key <= "9") {
        event.preventDefault();
        if (step === "pin") handlePinKey(event.key);
        else handleConfirmKey(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        if (step === "pin") handlePinKey("del");
        else handleConfirmKey("del");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // pin/confirmPin en deps para que el handler lea siempre el valor actual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pin, confirmPin, busy, requiresPinSetup]);

  const steps = useMemo(
    () =>
      requiresPinSetup
        ? (["employee", "pin", "confirm", "profile", "ready"] as Step[])
        : (["employee", "greeting", "pin"] as Step[]),
    [requiresPinSetup]
  );
  void steps; // used only for flow logic reference

  // ─── Auth handlers ────────────────────────────────────────────────

  async function nextFromEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await inspectEmployee(employeeNumber);
      setLookup(result.user);
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
      await saveProfileWithAvatar(result.user);
      markDesktopFreshLogin();
      // Sin correo real no puede recuperar su PIN solo. Se le pide AQUÍ, con la
      // sesión ya creada: en /recuperar no hay sesión y aceptar el correo que
      // teclee cualquiera seria regalar la cuenta a quien sepa el número.
      if (result.needsEmail) {
        setUser(result.user);
        setStep("email");
        return;
      }
      goToDashboard(result.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible iniciar sesión.");
      setStep("pin");
    } finally {
      setBusy(false);
    }
  }

  function goToDashboard(quien: { role: string; checklistOnly?: boolean }) {
    /*
     * ⚠️ Por `portadaDe`, no a mano. Entrar con el PIN dentro de la APK caía en
     * la portada de la WEB: el arreglo del arranque en frío cubrió la raíz y
     * los botones de volver, y se olvidó de este camino --que es por donde se
     * entra en la primera instalación.
     */
    router.replace(portadaDe(quien, enContenedorNativo()));
    router.refresh();
  }

  /**
   * Guarda el correo y entra. Si falla el guardado NO se bloquea el acceso: la
   * persona ya se autenticó y el correo es un extra, no un requisito para usar
   * la app. El error se muestra y puede posponerlo.
   */
  async function saveEmailAndContinue(email: string) {
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || "No se pudo guardar el correo.");
    }
    goToDashboard(user ?? { role: "ASESOR" });
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
    // Se dispara desde el saludo, ANTES de autenticar: ahí lo que existe es
    // `lookup`, no `user` (que solo se llena tras iniciar sesión).
    if (!lookup) return;
    setBusy(true);
    setError("");
    try {
      const options = await getBiometricAuthOptions(employeeNumber);
      const authentication = await startAuthentication({ optionsJSON: options });
      const result = await authenticateBiometric(employeeNumber, authentication);
      await saveProfileWithAvatar(result.user);
      markDesktopFreshLogin();
      router.replace(portadaDe(result.user, enContenedorNativo()));
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

          {step === "employee" && (
            <EmployeeStep
              employeeNumber={employeeNumber}
              setEmployeeNumber={(v) => { setEmployeeNumber(v); setError(""); }}
              onSubmit={nextFromEmployee}
              error={error}
              busy={busy}
              isDark={isDark}
              card={card}
            />
          )}

          {step === "greeting" && lookup ? (
            <GreetingStep
              user={lookup}
              greeting={greeting}
              isDark={isDark}
              busy={busy}
              error={error}
              onBiometricLogin={() => void handleBiometricLogin()}
              onPinLogin={() => setStep("pin")}
              onBack={() => { setStep("employee"); }}
            />
          ) : null}

          {step === "pin" ? (
            <PinStep
              pin={pin}
              requiresPinSetup={requiresPinSetup}
              error={error}
              isDark={isDark}
              card={card}
              physicalKeyboard={physicalKeyboard}
              onKey={handlePinKey}
            />
          ) : null}

          {step === "confirm" ? (
            <ConfirmStep
              confirmPin={confirmPin}
              pin={pin}
              error={error}
              isDark={isDark}
              card={card}
              physicalKeyboard={physicalKeyboard}
              onKey={handleConfirmKey}
            />
          ) : null}

          {step === "profile" ? (
            <ProfileStep
              user={user}
              photoPreview={photoPreview}
              biometricStatus={biometricStatus}
              error={error}
              busy={busy}
              isDark={isDark}
              card={card}
              fileInputRef={fileInputRef}
              onPhotoChange={(e) => void handlePhotoChange(e)}
              onBiometricSetup={() => void handleBiometricSetup()}
              onContinue={() => setStep("ready")}
            />
          ) : null}

          {step === "ready" ? (
            <ReadyStep
              error={error}
              isDark={isDark}
              card={card}
              onEnter={async () => {
                if (user) await saveProfileWithAvatar(user);
                markDesktopFreshLogin();
                router.replace(destination);
                router.refresh();
              }}
            />
          ) : null}

          {step === "email" ? (
            <EmailStep
              name={user?.name.split(" ")[0] ?? ""}
              isDark={isDark}
              card={card}
              onSave={saveEmailAndContinue}
              onSkip={() => goToDashboard(user ?? { role: "ASESOR" })}
            />
          ) : null}
        </AnimatePresence>

        <footer className="space-y-1 pb-6 pt-2 text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <div>
            <a href="/privacidad" className="underline-offset-2 hover:underline">Aviso de privacidad</a>
            <span className="mx-2 opacity-50">·</span>
            <a href="/terminos" className="underline-offset-2 hover:underline">Términos de uso</a>
          </div>
          <p className="opacity-70">© {new Date().getFullYear()} CLARVEX · Jesús Adrián Hernández Luna. Todos los derechos reservados.</p>
        </footer>
      </div>
    </main>
  );
}
