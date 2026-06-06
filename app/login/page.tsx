"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Camera, Fingerprint, LogIn, ShieldCheck, Sparkles } from "lucide-react";
import { fetchAppData } from "@/lib/app-data";
import { loginByEmployeeNumberFromDb, saveSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { Badge, Button, Card, PinPad, ProfileAvatar } from "@/components/ui";

type Step = "employee" | "pin" | "confirm" | "profile" | "ready";

const stepLabels: Record<Step, string> = {
  employee: "Empleado",
  pin: "Crear PIN",
  confirm: "Confirmar",
  profile: "Perfil",
  ready: "Listo"
};

export default function LoginPage() {
  const router = useRouter();
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<Step>("employee");
  const [error, setError] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const detectedUser = useMemo(
    () => users.find((user) => user.employeeNumber === employeeNumber.trim()),
    [employeeNumber, users]
  );
  const activeIndex = Object.keys(stepLabels).indexOf(step);

  useEffect(() => {
    fetchAppData().then((data) => setUsers(data.users)).catch(() => setUsers([]));
  }, []);

  function enter(user: User) {
    saveSession(user);
    router.push(user.role === "ASESOR" ? "/advisor" : "/manager");
  }

  async function finishLogin() {
    try {
      const user = await loginByEmployeeNumberFromDb(employeeNumber);
      enter(user);
    } catch {
      if (detectedUser) enter(detectedUser);
      else setError("No encontre ese numero de empleado.");
    }
  }

  function nextFromEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detectedUser) {
      setError("Escribe un numero de empleado valido.");
      return;
    }
    setError("");
    setStep("pin");
  }

  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-5">
          <div className="mb-5 flex items-center justify-between">
            <div className="grid size-12 place-items-center rounded-2xl border border-volt/25 bg-volt/12 text-volt shadow-glow">
              <Sparkles size={21} />
            </div>
            <Badge>mobile PWA</Badge>
          </div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-volt">CLARVEX Team</p>
          <h1 className="mt-3 text-4xl font-black leading-[0.98] tracking-tight text-ink">Tu app de tienda.</h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted">Acceso por empleado, PIN y perfil preparado para biometria.</p>
        </div>

        <div className="mb-4 grid grid-cols-5 gap-2">
          {(Object.keys(stepLabels) as Step[]).map((item, index) => (
            <div key={item} className={`h-1.5 rounded-full transition ${index <= activeIndex ? "bg-volt" : "bg-white/10"}`} />
          ))}
        </div>

        <Card className="space-y-4 overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-volt">
                <ShieldCheck size={18} />
                {stepLabels[step]}
              </div>
              <p className="mt-1 text-xs text-muted">Flujo visual listo para seguridad movil.</p>
            </div>
            <Fingerprint className="text-volt" size={22} />
          </div>

          {step === "employee" ? (
            <form className="space-y-3" onSubmit={nextFromEmployee}>
              <label className="block text-sm font-bold text-ink/75" htmlFor="employeeNumber">
                Numero de empleado
              </label>
              <input
                id="employeeNumber"
                value={employeeNumber}
                onChange={(event) => {
                  setEmployeeNumber(event.target.value.replace(/\D/g, ""));
                  setError("");
                }}
                inputMode="numeric"
                autoComplete="off"
                className="min-h-14 w-full rounded-2xl border border-line/80 bg-panel/75 px-4 text-center text-xl font-black tracking-[0.18em] text-ink outline-none shadow-inner transition placeholder:text-muted/40 focus:border-volt focus:ring-4 focus:ring-volt/18"
                placeholder="81893"
              />
              {detectedUser ? (
                <div className="flex items-center justify-between rounded-2xl border border-volt/30 bg-volt/10 px-3 py-3">
                  <span className="flex items-center gap-2 text-sm font-bold text-ink/90">
                    <BadgeCheck className="text-volt" size={18} />
                    {detectedUser.name}
                  </span>
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-volt">{detectedUser.role}</span>
                </div>
              ) : null}
              {error ? <p className="text-sm font-semibold text-orchid">{error}</p> : null}
              <Button className="w-full" type="submit" variant="primary">
                Continuar
              </Button>
            </form>
          ) : null}

          {step === "pin" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-black">Crea tu PIN</h2>
                <p className="mt-1 text-sm text-muted">Usaremos 4 digitos para acceso rapido.</p>
              </div>
              <PinPad value={pin} onChange={setPin} />
              <Button className="w-full" variant="primary" disabled={pin.length < 4} onClick={() => setStep("confirm")}>
                Guardar PIN
              </Button>
            </div>
          ) : null}

          {step === "confirm" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-black">Confirma tu PIN</h2>
                <p className="mt-1 text-sm text-muted">Debe coincidir con el PIN anterior.</p>
              </div>
              <PinPad value={confirmPin} onChange={setConfirmPin} />
              {confirmPin.length === 4 && confirmPin !== pin ? <p className="text-sm font-semibold text-orchid">Los PIN no coinciden.</p> : null}
              <Button className="w-full" variant="primary" disabled={confirmPin.length < 4 || confirmPin !== pin} onClick={() => setStep("profile")}>
                Confirmar PIN
              </Button>
            </div>
          ) : null}

          {step === "profile" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <ProfileAvatar name={detectedUser?.name ?? "CL"} photoUrl={detectedUser?.photoUrl} size="lg" />
                <div>
                  <h2 className="text-xl font-black">{detectedUser?.name ?? "Perfil"}</h2>
                  <p className="mt-1 text-sm text-muted">Foto y biometria quedan preparados visualmente.</p>
                </div>
              </div>
              <div className="grid gap-3">
                <button className="liquid-glass flex min-h-14 items-center justify-between rounded-2xl px-4 text-left">
                  <span className="flex items-center gap-3 font-bold"><Camera className="text-sky" size={18} /> Agregar foto</span>
                  <Badge tone="info">pronto</Badge>
                </button>
                <button className="liquid-glass flex min-h-14 items-center justify-between rounded-2xl px-4 text-left">
                  <span className="flex items-center gap-3 font-bold"><Fingerprint className="text-purple" size={18} /> Activar biometria</span>
                  <Badge>visual</Badge>
                </button>
              </div>
              <Button className="w-full" variant="primary" onClick={() => setStep("ready")}>
                Continuar
              </Button>
            </div>
          ) : null}

          {step === "ready" ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto grid size-16 place-items-center rounded-[1.35rem] border border-volt/30 bg-volt/15 text-volt">
                <BadgeCheck size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-black">Listo para operar</h2>
                <p className="mt-2 text-sm text-muted">Tu perfil esta preparado para la experiencia movil.</p>
              </div>
              <Button className="w-full" variant="primary" icon={<LogIn size={17} />} onClick={finishLogin}>
                Entrar a CLARVEX
              </Button>
            </div>
          ) : null}

          <div className="border-t border-white/10 pt-3">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-muted">Usuarios demo</p>
            <div className="grid gap-2">
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => enter(user)}
                  className="liquid-glass flex w-full items-center justify-between rounded-2xl p-3 text-left"
                >
                  <span className="flex items-center gap-3">
                    <ProfileAvatar name={user.name} photoUrl={user.photoUrl} size="sm" />
                    <span>
                      <span className="block font-bold text-ink/90">{user.name}</span>
                      <span className="text-xs text-muted">#{user.employeeNumber} / {user.role.toLowerCase()}</span>
                    </span>
                  </span>
                  <LogIn className="text-muted" size={18} />
                </button>
              ))}
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}
