"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Fingerprint, LogIn, ShieldCheck, Sparkles } from "lucide-react";
import { fetchAppData } from "@/lib/app-data";
import { loginByEmployeeNumberFromDb, saveSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { Badge, Button, Card } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [error, setError] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const detectedUser = useMemo(
    () => users.find((user) => user.employeeNumber === employeeNumber.trim()),
    [employeeNumber, users]
  );

  useEffect(() => {
    fetchAppData().then((data) => setUsers(data.users)).catch(() => setUsers([]));
  }, []);

  function enter(userId: string) {
    const user = users.find((item) => item.id === userId);
    if (!user) return;
    saveSession(user);
    router.push(user.role === "ASESOR" ? "/advisor" : "/manager");
  }

  async function enterByEmployeeNumber(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const user = await loginByEmployeeNumberFromDb(employeeNumber);
      router.push(user.role === "ASESOR" ? "/advisor" : "/manager");
    } catch {
      setError("No encontre ese numero de empleado.");
    }
  }

  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-5">
          <div className="mb-5 flex items-center justify-between">
            <div className="grid size-12 place-items-center rounded-2xl border border-mint/25 bg-mint/12 text-mint shadow-glow">
              <Sparkles size={21} />
            </div>
            <Badge>mobile PWA</Badge>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-volt">CLARVEX Team</p>
          <h1 className="mt-3 text-4xl font-black leading-[0.98] tracking-tight text-ink/95">Retail ops desde el celular.</h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-ink/62">Panel demo para metas, pendientes, horarios y comunicados de tienda, sin datos reales de marcas externas.</p>
        </div>

        <Card className="space-y-3 overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-mint">
                <ShieldCheck size={18} />
                Acceso del equipo
              </div>
              <p className="mt-1 text-xs text-ink/46">Escribe tu numero y detecto tu rol.</p>
            </div>
            <div className="grid size-11 place-items-center rounded-2xl bg-ink/[0.045] text-volt">
              <Fingerprint size={21} />
            </div>
          </div>

          <form className="space-y-3" onSubmit={enterByEmployeeNumber}>
            <label className="block text-sm font-bold text-ink/70" htmlFor="employeeNumber">
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
              className="min-h-14 w-full rounded-2xl border border-line/80 bg-panel/75 px-4 text-center text-xl font-black tracking-[0.18em] text-ink outline-none shadow-inner transition placeholder:text-ink/30 focus:border-mint focus:ring-4 focus:ring-mint/18"
              placeholder="81893"
            />
            {detectedUser ? (
              <div className="flex items-center justify-between rounded-2xl border border-mint/30 bg-mint/10 px-3 py-3">
                <span className="flex items-center gap-2 text-sm font-bold text-ink/80">
                  <BadgeCheck className="text-mint" size={18} />
                  {detectedUser.name}
                </span>
                <span className="text-xs font-black uppercase tracking-[0.14em] text-mint">{detectedUser.role}</span>
              </div>
            ) : null}
            {error ? <p className="text-sm font-semibold text-orchid">{error}</p> : null}
            <Button className="w-full" type="submit">
              Entrar
            </Button>
          </form>

          <div className="pt-2">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-ink/42">Usuarios demo</p>
          </div>
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => enter(user.id)}
              className="liquid-glass flex w-full items-center justify-between rounded-2xl p-3 text-left"
            >
              <span className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-volt/12 text-sm font-black text-volt">{user.avatar}</span>
                <span>
                  <span className="block font-bold text-ink/90">{user.name}</span>
                  <span className="text-xs text-ink/48">#{user.employeeNumber} / {user.role.toLowerCase()}</span>
                </span>
              </span>
              <LogIn className="text-ink/42" size={18} />
            </button>
          ))}
          <Button className="mt-2 w-full" onClick={() => enter("itzel")}>
            Entrar como gerente
          </Button>
        </Card>
      </section>
    </main>
  );
}
