"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Camera, Fingerprint, LogIn, ShieldCheck, Sparkles } from "lucide-react";
import { createPin, inspectEmployee, loginWithPin } from "@/lib/auth";
import type { User } from "@/lib/types";
import { Badge, Button, Card, ProfileAvatar } from "@/components/ui";

type Step = "employee" | "pin" | "confirm" | "profile" | "ready";

export default function LoginPage() {
  const router = useRouter();
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<Step>("employee");
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [requiresPinSetup, setRequiresPinSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const steps = useMemo(() => requiresPinSetup
    ? ["employee", "pin", "confirm", "profile", "ready"] as Step[]
    : ["employee", "pin", "ready"] as Step[], [requiresPinSetup]);
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
      const result = requiresPinSetup
        ? await createPin(employeeNumber, pinValue)
        : await loginWithPin(employeeNumber, pinValue);
      router.replace(result.user.role === "ASESOR" ? "/advisor" : "/manager");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible iniciar sesion.");
      if (!requiresPinSetup) setStep("pin");
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

  function updateConfirmation(value: string) {
    const nextPin = value.replace(/\D/g, "").slice(0, 4);
    setConfirmPin(nextPin);
    if (nextPin.length === 4 && nextPin === pin) setStep("profile");
  }

  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-5">
          <div className="mb-5 flex items-center justify-between">
            <div className="grid size-12 place-items-center rounded-2xl border border-volt/25 bg-volt/12 text-volt shadow-glow"><Sparkles size={21} /></div>
            <Badge>mobile PWA</Badge>
          </div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-volt">CLARVEX Team</p>
          <h1 className="mt-3 text-4xl font-black leading-[0.98] tracking-tight text-ink">Tu app de tienda.</h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted">Acceso seguro por empleado y PIN personal.</p>
        </div>

        <div className={`mb-4 grid gap-2 ${requiresPinSetup ? "grid-cols-5" : "grid-cols-3"}`}>
          {steps.map((item, index) => <div key={item} className={`h-1.5 rounded-full transition ${index <= activeIndex ? "bg-volt" : "bg-slate-200"}`} />)}
        </div>

        <Card className="space-y-4 overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-volt"><ShieldCheck size={18} />Acceso seguro</div>
              <p className="mt-1 text-xs text-muted">La sesion se guarda en una cookie protegida.</p>
            </div>
            <Fingerprint className="text-volt" size={22} />
          </div>

          {step === "employee" ? (
            <form className="space-y-3" onSubmit={nextFromEmployee}>
              <label className="block text-sm font-bold text-ink/75" htmlFor="employeeNumber">Numero de empleado</label>
              <input id="employeeNumber" type="tel" value={employeeNumber} onChange={(event) => { setEmployeeNumber(event.target.value.replace(/\D/g, "")); setError(""); }} inputMode="numeric" autoComplete="username" autoFocus className="min-h-14 w-full rounded-2xl border border-line/80 bg-panel/75 px-4 text-center text-xl font-black tracking-[0.18em] text-ink outline-none shadow-inner transition placeholder:text-muted/40 focus:border-volt focus:ring-4 focus:ring-volt/18" placeholder="81893" />
              {error ? <p className="text-sm font-semibold text-orchid">{error}</p> : null}
              <Button className="w-full" type="submit" variant="primary" disabled={busy || !employeeNumber}>Continuar</Button>
            </form>
          ) : null}

          {step === "pin" ? (
            <div className="space-y-4">
              {user ? <div className="flex items-center gap-3 rounded-2xl border border-volt/25 bg-volt/10 p-3"><ProfileAvatar name={user.name} photoUrl={user.photoUrl} size="sm" /><div><p className="font-black">{user.name}</p><p className="text-xs text-muted">{requiresPinSetup ? "Crea tu PIN de primer ingreso" : "Ingresa tu PIN"}</p></div></div> : null}
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
              <Button className="w-full" variant="primary" disabled={busy || pin.length < 4} onClick={() => requiresPinSetup ? setStep("confirm") : void finishLogin()}>{requiresPinSetup ? "Guardar PIN" : "Entrar"}</Button>
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
                  onChange={(event) => updateConfirmation(event.target.value)}
                  className="min-h-14 w-full rounded-2xl border border-line bg-panel px-4 text-center text-2xl font-black tracking-[0.65em] text-ink outline-none transition focus:border-volt focus:ring-4 focus:ring-volt/15"
                />
              </label>
              {confirmPin.length === 4 && confirmPin !== pin ? <p className="text-sm font-semibold text-orchid">Los PIN no coinciden.</p> : null}
              <Button className="w-full" variant="primary" disabled={confirmPin.length < 4 || confirmPin !== pin} onClick={() => setStep("profile")}>Confirmar PIN</Button>
            </div>
          ) : null}

          {step === "profile" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4"><ProfileAvatar name={user?.name ?? "CL"} photoUrl={user?.photoUrl} size="lg" /><div><h2 className="text-xl font-black">{user?.name}</h2><p className="mt-1 text-sm text-muted">Tu perfil esta listo para operar.</p></div></div>
              <div className="grid gap-3">
                <button className="liquid-glass flex min-h-14 items-center justify-between rounded-2xl px-4 text-left"><span className="flex items-center gap-3 font-bold"><Camera className="text-sky" size={18} /> Agregar foto</span><Badge tone="info">pronto</Badge></button>
                <button className="liquid-glass flex min-h-14 items-center justify-between rounded-2xl px-4 text-left"><span className="flex items-center gap-3 font-bold"><Fingerprint className="text-purple" size={18} /> Activar biometria</span><Badge>pronto</Badge></button>
              </div>
              <Button className="w-full" variant="primary" onClick={() => setStep("ready")}>Continuar</Button>
            </div>
          ) : null}

          {step === "ready" ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto grid size-16 place-items-center rounded-[1.35rem] border border-volt/30 bg-volt/15 text-volt"><BadgeCheck size={28} /></div>
              <div><h2 className="text-2xl font-black">Listo para operar</h2><p className="mt-2 text-sm text-muted">Tu PIN se guardara cifrado y abriremos una sesion segura.</p></div>
              {error ? <p className="text-sm font-semibold text-orchid">{error}</p> : null}
              <Button className="w-full" variant="primary" icon={<LogIn size={17} />} disabled={busy} onClick={() => void finishLogin()}>Entrar a CLARVEX</Button>
            </div>
          ) : null}
        </Card>
      </section>
    </main>
  );
}
