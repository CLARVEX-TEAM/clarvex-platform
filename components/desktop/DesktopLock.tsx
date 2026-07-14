"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { ArrowLeft, Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { inspectEmployee, loginWithPin } from "@/lib/auth";
import {
  getSavedProfiles,
  removeProfile,
  saveProfileWithAvatar,
  type SavedProfile
} from "@/lib/desktop-profiles";
import type { User } from "@/lib/types";
import { ClarvexIcon } from "@/components/ClarvexIcon";

type Mode = "picker" | "pin" | "add";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function roleLabel(role: SavedProfile["role"]) {
  return role === "GERENTE" ? "Gerente" : role === "SUBGERENTE" ? "Subgerente" : "Vendedor";
}

/** Perfil mostrado en la pantalla de PIN: el rol y la foto pueden faltar. */
type LockProfile = Omit<SavedProfile, "role"> & { role: SavedProfile["role"] | null };

function Avatar({
  name,
  photoUrl,
  size
}: {
  name: string;
  photoUrl?: string | null;
  size: number;
}) {
  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className="size-full object-cover"
      />
    );
  }
  return (
    <div
      className="flex size-full items-center justify-center font-black text-white"
      style={{
        fontSize: size * 0.34,
        background: "linear-gradient(135deg, #60a5fa 0%, #1d4ed8 100%)"
      }}
    >
      {initials(name)}
    </div>
  );
}

function PinDots({ filled, error }: { filled: number; error: boolean }) {
  return (
    <div className="flex justify-center gap-4 py-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div
          key={i}
          animate={
            error
              ? { x: [0, -6, 6, -4, 4, 0] }
              : i === filled - 1 && filled > 0
                ? { scale: [1, 1.4, 1] }
                : { scale: 1 }
          }
          transition={{ duration: error ? 0.4 : 0.18 }}
          className={`size-[18px] rounded-full transition-colors duration-150 ${
            error
              ? "bg-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.6)]"
              : i < filled
                ? "bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.7)]"
                : "bg-white/15"
          }`}
        />
      ))}
    </div>
  );
}

export function DesktopLock({ onUnlock }: { onUnlock: (user: User) => void }) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [mode, setMode] = useState<Mode>("picker");
  // Un perfil guardado trae rol y foto (se guardaron tras iniciar sesión). Uno
  // tecleado a mano no: sin sesión solo se conoce el nombre.
  const [selected, setSelected] = useState<LockProfile | null>(null);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [manage, setManage] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    const saved = getSavedProfiles();
    setProfiles(saved);
    if (saved.length === 0) setMode("add");
  }, []);

  function choose(profile: SavedProfile) {
    setSelected(profile);
    setEmployeeNumber(profile.employeeNumber);
    setPin("");
    setError("");
    setShake(false);
    setMode("pin");
  }

  function backToPicker() {
    setMode(profiles.length === 0 ? "add" : "picker");
    setSelected(null);
    setPin("");
    setError("");
    setEmployeeNumber("");
  }

  async function submitPin(value: string) {
    const next = value.replace(/\D/g, "").slice(0, 4);
    setPin(next);
    setError("");
    if (next.length !== 4 || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const { user } = await loginWithPin(employeeNumber, next);
      // El rol solo se conoce ya autenticado: aquí se filtra el acceso al
      // escritorio (antes se hacía en el inspect, filtrando el rol sin sesión).
      if (user.role === "ASESOR") {
        setError("El escritorio es solo para gerencia. Usa la app móvil.");
        setPin("");
        setBusy(false);
        submittingRef.current = false;
        return;
      }
      await saveProfileWithAvatar(user);
      onUnlock(user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "PIN incorrecto.");
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 450);
      submittingRef.current = false;
      setBusy(false);
    }
  }

  async function submitEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !employeeNumber) return;
    setBusy(true);
    setError("");
    try {
      const result = await inspectEmployee(employeeNumber);
      // El rol NO se conoce antes de autenticar (sería cosechable tecleando
      // números de empleado). El filtro de "solo gerencia" se aplica tras el PIN.
      if (result.requiresPinSetup) {
        // Primer ingreso: configuración completa (PIN, foto, biometría) en /login.
        router.push("/login");
        return;
      }
      setSelected({
        employeeNumber,
        name: result.user.name,
        role: null,
        photoUrl: null,
        storeName: null
      });
      setPin("");
      setMode("pin");
      setBusy(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No encontré ese número de empleado.");
      setBusy(false);
    }
  }

  // Teclado físico para el PIN (escritorio): sin teclado en pantalla.
  useEffect(() => {
    if (mode !== "pin") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key >= "0" && event.key <= "9") {
        event.preventDefault();
        void submitPin(pin + event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        setPin((p) => p.slice(0, -1));
        setError("");
      } else if (event.key === "Escape") {
        event.preventDefault();
        backToPicker();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pin, employeeNumber]);

  function handleRemove(employeeNumberToRemove: string) {
    removeProfile(employeeNumberToRemove);
    const next = getSavedProfiles();
    setProfiles(next);
    if (next.length === 0) {
      setManage(false);
      setMode("add");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#070b16] text-white">
      {/* Glows de fondo */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 0%, rgba(37,99,235,0.28), transparent 60%), radial-gradient(55% 45% at 85% 20%, rgba(124,58,237,0.18), transparent 60%)"
        }}
      />

      {/* Marca */}
      <div className="relative z-10 flex items-center gap-2.5 px-8 py-6">
        <span
          className="grid size-9 place-items-center rounded-xl shadow-[0_8px_24px_rgba(37,99,235,0.45)]"
          style={{ background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" }}
        >
          <ClarvexIcon size={20} />
        </span>
        <span className="text-[12px] font-black tracking-[0.36em] text-blue-300">CLARVEX TEAM</span>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16">
        <AnimatePresence mode="wait" initial={false}>
          {/* ─── ¿Quién eres? ─────────────────────────────────────── */}
          {mode === "picker" && (
            <motion.div
              key="picker"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-3xl text-center"
            >
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">¿Quién eres?</h1>
              <p className="mt-3 text-base text-white/55">Elige tu perfil para continuar</p>

              <div className="mt-12 flex flex-wrap items-start justify-center gap-7">
                {profiles.map((profile) => (
                  <div key={profile.employeeNumber} className="relative">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.06, y: -4 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => (manage ? undefined : choose(profile))}
                      className="group flex w-[140px] flex-col items-center gap-3"
                    >
                      <span className="relative block size-[140px] overflow-hidden rounded-3xl ring-2 ring-white/10 transition group-hover:ring-blue-400/80">
                        <Avatar name={profile.name} photoUrl={profile.photoUrl} size={140} />
                        <span className="pointer-events-none absolute inset-0 rounded-3xl bg-black/10 transition group-hover:bg-transparent" />
                      </span>
                      <span className="leading-tight">
                        <span className="block truncate text-[15px] font-bold text-white/90">
                          {profile.name.split(" ").slice(0, 2).join(" ")}
                        </span>
                        <span className="block text-xs font-semibold text-white/45">
                          {roleLabel(profile.role)}
                        </span>
                      </span>
                    </motion.button>
                    {manage ? (
                      <button
                        type="button"
                        onClick={() => handleRemove(profile.employeeNumber)}
                        aria-label={`Quitar a ${profile.name}`}
                        className="absolute -right-1 -top-1 grid size-7 place-items-center rounded-full bg-rose-500 text-white shadow-lg transition hover:bg-rose-600"
                      >
                        <X size={15} />
                      </button>
                    ) : null}
                  </div>
                ))}

                {/* Agregar perfil */}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.06, y: -4 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setEmployeeNumber("");
                    setError("");
                    setMode("add");
                  }}
                  className="group flex w-[140px] flex-col items-center gap-3"
                >
                  <span className="grid size-[140px] place-items-center rounded-3xl border-2 border-dashed border-white/15 text-white/40 transition group-hover:border-blue-400/70 group-hover:text-blue-300">
                    <Plus size={40} />
                  </span>
                  <span className="text-[15px] font-bold text-white/55">Agregar perfil</span>
                </motion.button>
              </div>

              {profiles.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setManage((m) => !m)}
                  className="mt-12 rounded-full border border-white/15 px-6 py-2 text-sm font-bold text-white/60 transition hover:border-white/40 hover:text-white"
                >
                  {manage ? "Listo" : "Administrar perfiles"}
                </button>
              ) : null}
            </motion.div>
          )}

          {/* ─── Ingreso de PIN ───────────────────────────────────── */}
          {mode === "pin" && selected && (
            <motion.div
              key="pin"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-sm"
            >
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                <div className="mx-auto mb-4 size-[88px] overflow-hidden rounded-3xl ring-2 ring-blue-400/60 shadow-[0_0_40px_rgba(37,99,235,0.4)]">
                  <Avatar name={selected.name} photoUrl={selected.photoUrl} size={88} />
                </div>
                <h2 className="text-xl font-black">{selected.name.split(" ").slice(0, 2).join(" ")}</h2>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-white/50">
                  <ShieldCheck size={14} className="text-blue-400" /> Ingresa tu PIN
                </p>

                <div className="mt-6">
                  <PinDots filled={pin.length} error={shake} />
                </div>

                <p className="mt-4 text-sm font-semibold text-white/45">
                  {busy ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={15} className="animate-spin" /> Verificando…
                    </span>
                  ) : error ? (
                    <span className="text-rose-400">{error}</span>
                  ) : (
                    "Escribe tu PIN con el teclado"
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={backToPicker}
                className="mx-auto mt-6 flex items-center gap-2 text-sm font-bold text-white/50 transition hover:text-white"
              >
                <ArrowLeft size={16} /> Cambiar de usuario
              </button>
            </motion.div>
          )}

          {/* ─── Agregar perfil (número de empleado) ──────────────── */}
          {mode === "add" && (
            <motion.div
              key="add"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-sm"
            >
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                <h2 className="text-2xl font-black">Agregar perfil</h2>
                <p className="mt-2 text-sm text-white/50">Ingresa tu número de empleado</p>
                <form className="mt-6 space-y-4" onSubmit={submitEmployee}>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoFocus
                    value={employeeNumber}
                    onChange={(e) => {
                      setEmployeeNumber(e.target.value.replace(/\D/g, ""));
                      setError("");
                    }}
                    placeholder="ej. 81893"
                    className="min-h-14 w-full rounded-2xl border border-white/15 bg-white/5 px-4 text-center text-xl font-black tracking-[0.18em] text-white outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-white/30 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/25"
                  />
                  {error ? <p className="text-sm font-semibold text-rose-400">{error}</p> : null}
                  <button
                    type="submit"
                    disabled={busy || !employeeNumber}
                    className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-[15px] font-black text-white shadow-[0_10px_30px_rgba(37,99,235,0.45)] transition hover:bg-blue-500 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={18} className="animate-spin" /> : null}
                    Continuar
                  </button>
                </form>
              </div>

              {profiles.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setMode("picker");
                  }}
                  className="mx-auto mt-6 flex items-center gap-2 text-sm font-bold text-white/50 transition hover:text-white"
                >
                  <ArrowLeft size={16} /> Volver a perfiles
                </button>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
