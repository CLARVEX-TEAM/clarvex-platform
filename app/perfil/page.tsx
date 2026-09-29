"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Cake, Camera, ChevronRight, Fingerprint, ImageUp, LifeBuoy, LogOut, Moon, ScrollText, Smartphone, Store, Sun, UserRound } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { getBiometricRegistrationOptions, getSession, logout, registerBiometric } from "@/lib/auth";
import type { User, Role } from "@/lib/types";
import { AppFrame, AppHeader, Badge, Button, Card, ProfileAvatar } from "@/components/ui";
import { SaveButton } from "@/components/ActionButtons";
import { AjusteCandado } from "@/components/AjusteCandado";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SalidaDeKiosko } from "@/components/SalidaDeKiosko";
import { useToast } from "@/components/Toast";
import { useTheme, type Theme } from "@/components/ThemeProvider";

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

export default function ProfilePage() {
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
  const [email, setEmail] = useState("");
  const [savingDates, setSavingDates] = useState(false);
  const [savedDates, setSavedDates] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const router = useRouter();
  /* El kiosko está dado de alta con rol `ASESOR`, así que lo que lo distingue
     es `checklistOnly`, nunca el rol. */
  const esKiosko = user?.checklistOnly === true;

  /*
   * ⚠️ **`replace`, no `push`.** Con `push`, el botón físico de atrás de Android
   * devuelve al perfil de una sesión que ya no existe: la pantalla intenta
   * cargar, el servidor contesta 401 y se ve como que la app se rompió. La
   * sesión cerrada no es un paso al que se pueda volver.
   *
   * ⚠️ Y el estado de «saliendo» NO se apaga al terminar: cuando se llega aquí
   * ya se está navegando fuera, y apagarlo devolvería el botón a su aspecto
   * normal medio segundo antes de desaparecer, que se lee como que no funcionó.
   */
  async function cerrarSesion() {
    setSaliendo(true);
    try {
      const resultado = await logout();
      /* En el kiosko esto no se alcanza --ahí se pide el PIN--, pero si el
         servidor rechaza por cualquier motivo, NO se navega: mandar a /login
         con la sesión intacta hace creer que se cerró. */
      if (!resultado.ok) {
        setSaliendo(false);
        setConfirmarSalida(false);
        toast(resultado.error);
        return;
      }
      router.replace("/login");
    } catch {
      setSaliendo(false);
      setConfirmarSalida(false);
      toast("No se pudo cerrar la sesión. Revisa tu conexión.");
    }
  }

  useEffect(() => {
    getSession().then(setUser).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/profile")
      .then((response) => response.json() as Promise<{ birthDate?: string | null; hireDate?: string | null; email?: string | null }>)
      .then((data) => { setBirthDate(data.birthDate ?? ""); setHireDate(data.hireDate ?? ""); setEmail(data.email ?? ""); })
      .catch(() => undefined);
  }, []);

  async function saveDates() {
    const trimmedEmail = email.trim();
    setSavingDates(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate: birthDate || null,
          hireDate: hireDate || null,
          // Solo se manda si hay algo: el campo es opcional en el endpoint y
          // enviar "" lo haría fallar la validación de correo.
          ...(trimmedEmail ? { email: trimmedEmail } : {})
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error);
      }
      toast("Datos guardados.", "success");
      setSavedDates(true);
      window.setTimeout(() => setSavedDates(false), 2000);
    } catch (saveError) {
      toast(saveError instanceof Error && saveError.message ? saveError.message : "No se pudieron guardar.", "error");
    } finally {
      setSavingDates(false);
    }
  }

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    if (!acceptedTypes.includes(selected.type)) {
      toast("Usa una imagen JPG, PNG o WEBP.", "error");
      event.target.value = "";
      return;
    }
    if (selected.size > maxBytes) {
      toast("La imagen debe pesar menos de 5 MB.", "error");
      event.target.value = "";
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(selected));
    // Se sube SOLA. Antes había que pulsar un botón "Guardar foto" aparte, pero
    // el preview local se veía idéntico a una foto ya guardada: la gente creía
    // haberla cambiado, se salía, y al volver seguía la vieja. (En esta pantalla
    // además hay otro botón "Guardar datos", y ambos decían "¡Guardado!").
    void savePhoto(selected);
  }

  // Recibe el File directo: el estado de React todavía no lo tendría al llamarla
  // desde selectPhoto.
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
      // Falló: se quita el preview para no dejar en pantalla una foto que NO se
      // guardó (era justo lo que confundía).
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

  return (
    <>
      <AppHeader title="Mi perfil" subtitle="Tu identidad dentro de CLARVEX Team." backHref={user?.role === "ASESOR" ? "/advisor" : "/manager"} />
      <AppFrame>
        {loading ? <Card className="text-sm font-semibold text-muted">Cargando perfil...</Card> : !user ? <Card className="text-sm font-semibold text-orchid">No fue posible cargar tu perfil.</Card> : (
          <>
            {/*
              LA IDENTIDAD, en UN bloque.

              ⚠️ Antes eran tres --el retrato, y debajo una tarjeta con número de
              empleado y otra con la tienda--, así que lo que la pantalla
              responde en una frase («quién soy y dónde trabajo») ocupaba media
              pantalla y obligaba a bajar antes de llegar a lo que se puede
              hacer. Son cuatro datos que no cambian nunca: van juntos y arriba.

              ⚠️ La versión con degradado es SOLO de la APK --`solo-papel`--, y
              fuera queda la de antes con `fuera-de-papel`. El lenguaje `papel`
              no sale de la APK por decisión del usuario, y ese bloque no
              existía antes del rediseño, así que acotar el CSS no bastaría:
              quedaría sin fondo. Ver `app/papel.css`.
            */}
            <section className="solo-papel papel-hero papel-elev-alta relative mb-3 overflow-hidden rounded-[26px]">
              <svg aria-hidden viewBox="0 0 512 512" className="pointer-events-none absolute -right-10 -top-12 size-52 opacity-[0.07]">
                <path fill="#FFFFFF" d="M108 171 256 86 403 171 210 283v-57l93-53-47-27-95 55v111l95 56 48-28v-57l99 58-147 85-148-84V171Z" />
              </svg>
              <div className="relative flex items-center gap-4 px-5 pb-5 pt-5">
                <div className="relative shrink-0">
                  <ProfileAvatar name={user.name} photoUrl={previewUrl ?? user.photoUrl} size="lg" className="size-20 rounded-full ring-2 ring-white/40" />
                  <button type="button" onClick={() => inputRef.current?.click()} aria-label="Cambiar foto de perfil" className="tappable absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full bg-white text-[#0B3D91] shadow-md transition active:scale-95"><Camera size={15} /></button>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.01em]">{user.name}</h2>
                  <p className="mt-1 text-sm opacity-85">{roleLabels[user.role]}</p>
                </div>
              </div>
              {/* Los dos datos que nunca cambian, de pie de foto. */}
              <div className="relative flex border-t border-white/15">
                <div className="flex-1 px-5 py-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">Empleado</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">{user.employeeNumber}</p>
                </div>
                <div className="w-px bg-white/15" />
                <div className="flex-1 px-5 py-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">Tienda</p>
                  <p className="mt-0.5 truncate text-sm font-semibold">{user.storeName ?? "CLARVEX Team"}</p>
                </div>
              </div>
            </section>

            <div className="fuera-de-papel">
              <section className="mb-3 flex flex-col items-center px-4 py-5 text-center">
                <div className="relative">
                  <ProfileAvatar name={user.name} photoUrl={previewUrl ?? user.photoUrl} size="lg" className="size-28 rounded-full ring-4 ring-white dark:ring-[#2a3a5c]" />
                  <button type="button" onClick={() => inputRef.current?.click()} aria-label="Cambiar foto de perfil" className="absolute bottom-0 right-0 grid size-9 place-items-center rounded-full bg-volt text-white ring-4 ring-white dark:ring-[#2a3a5c] transition active:scale-95"><Camera size={16} /></button>
                </div>
                <h2 className="mt-3 text-xl font-semibold text-ink">{user.name}</h2>
                <Badge>{roleLabels[user.role]}</Badge>
              </section>

              <Card className="mb-3 divide-y divide-line p-3.5">
                <ProfileField icon={<UserRound size={17} />} label="Numero de empleado" value={user.employeeNumber} />
                <ProfileField icon={<Store size={17} />} label="Tienda" value={user.storeName ?? "CLARVEX Team"} />
              </Card>
            </div>

            <Rotulo>Tus datos</Rotulo>

            <Card className="mb-3 p-3.5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-volt/10 text-volt"><Cake size={19} /></span>
                <div><h2 className="font-semibold text-ink">Datos personales</h2><p className="text-xs text-muted">Para felicitarte en tu día 🎂</p></div>
              </div>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1">
                  <span className="text-xs font-bold text-muted">Cumpleaños</span>
                  <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-hidden focus:border-volt" />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-bold text-muted">Fecha de ingreso</span>
                  <input type="date" value={hireDate} onChange={(event) => setHireDate(event.target.value)} className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-hidden focus:border-volt" />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-bold text-muted">Correo</span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="tucorreo@ejemplo.com"
                    className="min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-hidden focus:border-volt"
                  />
                  <span className="text-[11px] text-muted">
                    {email
                      ? "Aquí te llega el enlace si olvidas tu PIN."
                      : "Sin correo no podrás recuperar tu PIN solo: tendrá que restablecerlo tu gerente."}
                  </span>
                </label>
                <SaveButton type="button" onClick={() => void saveDates()} loading={savingDates} success={savedDates} savedLabel="¡Guardado!">Guardar datos</SaveButton>
              </div>
            </Card>

            <Rotulo>Tu cuenta</Rotulo>

            <Card className="mb-3 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-2xl bg-panel text-muted">
                    {isDark ? <Moon size={19} /> : <Sun size={19} />}
                  </span>
                  <div>
                    <h2 className="font-semibold text-ink">Apariencia</h2>
                    <p className="text-xs text-muted">Tema de la aplicación</p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {(["light", "system", "dark"] as Theme[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTheme(t)}
                      className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold transition ${theme === t ? "bg-volt text-white shadow-xs" : "bg-panel dark:bg-panel text-muted"}`}
                    >
                      {t === "light" ? "Claro" : t === "dark" ? "Oscuro" : "Auto"}
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="mb-3 p-3.5">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-volt/10 text-volt"><ImageUp size={19} /></span><div><h2 className="font-semibold text-ink">Foto de perfil</h2><p className="text-xs text-muted">JPG, PNG o WEBP. Maximo 5 MB.</p></div></div>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} className="sr-only" />
              {/* Sin botón de guardar: al elegir la imagen se sube sola. */}
              <div className="mt-4">
                <Button type="button" variant="ghost" onClick={() => inputRef.current?.click()} disabled={saving} className="w-full">
                  {saving ? "Subiendo…" : user.photoUrl ? "Cambiar foto" : "Elegir foto"}
                </Button>
              </div>
            </Card>

            <Card className="mb-3 p-3.5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-volt/10 text-volt"><Fingerprint size={19} /></span>
                <div><h2 className="font-semibold text-ink">Acceso biometrico</h2><p className="text-xs text-muted">Face ID o huella dactilar para entrar sin PIN.</p></div>
              </div>
              {user.biometricEnabled ? (
                <div className="mt-4 flex items-center justify-between rounded-2xl border border-mint/30 bg-mint/10 px-4 py-3">
                  <span className="text-sm font-semibold text-mint">Face ID / Huella activos</span>
                  <Badge tone="done">activo</Badge>
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  <p className="text-xs text-muted">Inicia sesion rapido con tu huella o Face ID sin escribir tu PIN.</p>
                  <Button type="button" variant="primary" onClick={() => void handleBiometricSetup()} disabled={biometricBusy}>
                    {biometricBusy ? "Activando..." : "Activar Face ID / Huella"}
                  </Button>
                </div>
              )}
            </Card>

            {/* ⚠️ El acceso vive AQUI y no en un enlace suelto porque la app no
                tiene barra de direcciones: dentro del contenedor no hay forma de
                escribir una ruta, y el diagnostico solo dice algo util ahi
                dentro. En el navegador saldra todo en rojo, y es lo correcto. */}
            <AjusteCandado />

            <Rotulo>Ayuda y más</Rotulo>

            {/*
              Los cuatro destinos, en UNA tarjeta con renglones.

              ⚠️ Antes eran cuatro tarjetas idénticas seguidas, con el mismo
              peso visual que «Datos personales» --que es lo único de esta
              pantalla que se toca a diario--. Cuatro cajas del mismo tamaño no
              jerarquizan nada: aquí lo que se busca es «llévame allí», no
              volver a leerlas.
            */}
            <Card className="mb-3 divide-y divide-line p-0">
              <Destino href="/soporte" icono={<LifeBuoy size={18} />} titulo="Ayuda y soporte" nota="¿Un problema o duda? Escríbenos." destacado />
              {/* ⚠️ Este enlace es el que se manda al grupo para la PRIMERA
                  instalación: quien todavía no tiene la app no ve ningún aviso
                  dentro de ella, porque el aviso vive dentro de la app. */}
              <Destino href="/app" icono={<Smartphone size={18} />} titulo="La app de Android" nota="Instalarla en un teléfono nuevo." />
              <Destino href="/diagnostico" icono={<BellRing size={18} />} titulo="Diagnóstico" nota="¿No te llegan avisos o falla la cámara?" />
              <Destino href="/legal" icono={<ScrollText size={18} />} titulo="Avisos legales" nota="Términos, privacidad y más." />
            </Card>

            {/*
              CERRAR SESIÓN, al final y con confirmación.

              ⚠️ Va aquí abajo y no arriba a propósito: es lo que menos se usa y
              lo único de esta pantalla que no se puede deshacer con un toque
              --volver a entrar exige el PIN, y quien no tiene correo real no
              puede recuperarlo solo; lo tiene que restablecer su gerente--.

              ⚠️ Y confirma antes. En el teléfono de la tienda el dedo pasa por
              aquí camino de «Avisos legales», y un cierre de sesión accidental
              a media jornada deja a la persona fuera hasta que alguien llegue a
              ayudarla.
            */}
            <button
              type="button"
              onClick={() => setConfirmarSalida(true)}
              className="tappable mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-orchid/35 bg-card text-sm font-semibold text-orchid transition active:scale-[0.99]"
            >
              <LogOut size={17} /> Cerrar sesión
            </button>

            {/* ⚠️ En el celular KIOSKO no basta con confirmar: lo cierra
                gerencia con su PIN. Es el aparato compartido de la tienda y su
                sesión es la única puerta a Checklist y Conteos. El candado de
                verdad vive en el servidor; esto solo pide lo que va a exigir. */}
            {esKiosko ? (
              <SalidaDeKiosko abierto={confirmarSalida} onCancelar={() => setConfirmarSalida(false)} />
            ) : (
            <ConfirmDialog
              open={confirmarSalida}
              title="¿Cerrar sesión?"
              description="Tendrás que escribir tu PIN para volver a entrar."
              confirmLabel="Cerrar sesión"
              loading={saliendo}
              onConfirm={() => void cerrarSesion()}
              onCancel={() => setConfirmarSalida(false)}
            />
            )}
          </>
        )}
      </AppFrame>
    </>
  );
}

/**
 * El rótulo que separa un grupo del siguiente.
 *
 * ⚠️ No es decoración: esta pantalla apila nueve bloques y sin rótulos se lee
 * como una lista sin principio ni fin, donde «Datos personales» --lo único que
 * se toca a diario-- pesa lo mismo que «Avisos legales». Tres grupos y el ojo
 * sabe dónde mirar.
 */
function Rotulo({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-6 px-1 text-xs font-semibold uppercase tracking-[0.09em] text-muted">{children}</h2>;
}

/** Un renglón de la lista de destinos: llévame allí, no vuelvas a leerme. */
function Destino({ href, icono, titulo, nota, destacado = false }: { href: string; icono: React.ReactNode; titulo: string; nota: string; destacado?: boolean }) {
  return (
    <Link href={href} className="tappable flex min-h-16 items-center gap-3 px-4 transition active:scale-[0.99]">
      <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${destacado ? "bg-volt/12 text-volt" : "bg-panel text-ink/70"}`}>{icono}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{titulo}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">{nota}</span>
      </span>
      <ChevronRight size={17} className="shrink-0 text-muted" />
    </Link>
  );
}

function ProfileField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="grid size-9 place-items-center rounded-2xl bg-panel text-muted">{icon}</span><div><p className="text-xs font-semibold text-muted">{label}</p><p className="font-semibold text-ink">{value}</p></div></div>;
}
