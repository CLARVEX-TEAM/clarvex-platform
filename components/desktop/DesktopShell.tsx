"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import type { User } from "@/lib/types";
import { useTheme } from "@/components/ThemeProvider";
import { DesktopChromeProvider, FreshnessPill } from "@/components/desktop/DesktopChrome";
import { DesktopNotifications } from "@/components/desktop/DesktopNotifications";
import { DesktopLock } from "@/components/desktop/DesktopLock";
import { DeskRail } from "@/components/desktop/DeskRail";
import { DeskBackdrop } from "@/components/desktop/DeskBackdrop";
import { GradientText } from "@/components/magic/GradientText";
import { CommandPalette } from "@/components/desktop/CommandPalette";
import { resolveSection } from "@/components/desktop/nav";
import { consumeDesktopFreshLogin } from "@/lib/desktop-profiles";
import { noteViewRedirect, prefersDesktop, setViewPreference } from "@/lib/view-mode";

// Ancho mínimo para considerar "escritorio". Por debajo, gerencia usa la app móvil.
export const DESKTOP_MIN_WIDTH = 1024;

const PIN_KEY = "desk-rail-pinned";

// Sesión desbloqueada cacheada a nivel de módulo. Sobrevive a la navegación
// entre páginas del escritorio (mismo contexto JS). sessionStorage
// (desktop_unlocked) restaura el desbloqueo si el módulo se reinicia pero la
// pestaña sigue abierta (p. ej. al volver desde /admin o recargar el chunk).
let unlockedSession: User | null = null;

export function DesktopShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isDark, setTheme } = useTheme();
  const [user, setUser] = useState<User | null>(unlockedSession);
  const [checking, setChecking] = useState(unlockedSession === null);
  const [unlocked, setUnlocked] = useState(unlockedSession !== null);
  const [pinned, setPinned] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // El escritorio arranca en oscuro, pero solo si el usuario NUNCA ha elegido
  // tema. Se usa la preferencia global (misma llave que el móvil) a propósito:
  // Tailwind está en darkMode:"class" y todas las utilidades dark: de las
  // páginas cuelgan de la clase .dark del <html>. Con una llave aparte, el
  // escritorio se vería oscuro pero esas utilidades no dispararían.
  useEffect(() => {
    if (localStorage.getItem("clarvex-theme") === null) setTheme("dark");
    setPinned(localStorage.getItem(PIN_KEY) === "true");
  }, [setTheme]);

  // Guard de tamaño + bloqueo diario. El escritorio pide PIN al abrir una pestaña
  // nueva (sin desktop_unlocked en sessionStorage). Dentro de la misma pestaña se
  // restaura el desbloqueo vía sessionStorage + cookie válida — así no vuelve a
  // pedir PIN al navegar entre secciones ni al salir y volver a /escritorio.
  useEffect(() => {
    if (unlockedSession) return; // ya desbloqueado en memoria: no re-bloquear al navegar
    // Usar la MISMA decisión que /manager (prefersDesktop: respeta la preferencia
    // manual "desktop" y screen.width, no solo innerWidth). Si aquí usáramos solo
    // window.innerWidth < 1024, un POS con zoom rebotaría /escritorio ⇄ /manager
    // en bucle: el guard móvil lo trae a escritorio y este lo devolvía a móvil.
    if (typeof window !== "undefined" && !prefersDesktop()) {
      noteViewRedirect();
      router.replace("/manager");
      return;
    }

    function applyUnlock(session: User) {
      unlockedSession = session;
      setUser(session);
      setUnlocked(true);
      sessionStorage.setItem("desktop_unlocked", "true");
      window.dispatchEvent(new Event("desktop-lock-change"));
    }

    function finishCheck(session: User | null) {
      if (session && session.role !== "ASESOR") {
        applyUnlock(session);
      } else {
        sessionStorage.removeItem("desktop_unlocked");
        window.dispatchEvent(new Event("desktop-lock-change"));
      }
      setChecking(false);
    }

    if (consumeDesktopFreshLogin() || sessionStorage.getItem("desktop_unlocked") === "true") {
      // Un fallo de RED no es «no hay sesión»: no se pasa por `finishCheck`,
      // que borraría el desbloqueo. Solo se deja de esperar, para no quedar en
      // la comprobación para siempre; la marca de `sessionStorage` sobrevive y
      // al recargar se vuelve a intentar.
      getSession().then(finishCheck).catch(() => setChecking(false));
      return;
    }

    window.dispatchEvent(new Event("desktop-lock-change"));
    setChecking(false);
  }, [router]);

  // Ctrl+K en Windows, ⌘K en Mac. Se ignora mientras la pantalla está bloqueada.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const togglePin = useCallback(() => {
    setPinned((value) => {
      localStorage.setItem(PIN_KEY, String(!value));
      return !value;
    });
  }, []);

  function handleUnlock(unlockedUser: User) {
    if (unlockedUser.role === "ASESOR") {
      router.replace("/advisor");
      return;
    }
    unlockedSession = unlockedUser;
    setUser(unlockedUser);
    setUnlocked(true);
    sessionStorage.setItem("desktop_unlocked", "true");
    window.dispatchEvent(new Event("desktop-lock-change"));
  }

  function relock() {
    unlockedSession = null;
    setUser(null);
    setUnlocked(false);
    sessionStorage.removeItem("desktop_unlocked");
    window.dispatchEvent(new Event("desktop-lock-change"));
  }

  async function handleLogout() {
    unlockedSession = null;
    sessionStorage.removeItem("desktop_unlocked");
    window.dispatchEvent(new Event("desktop-lock-change"));
    await logout();
    router.push("/login");
  }

  const section = resolveSection(pathname);
  const todayLabel = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  if (checking) {
    return (
      <div data-surface="desk" className="grid min-h-screen place-items-center">
        <p className="text-ui text-muted">Cargando escritorio…</p>
      </div>
    );
  }

  if (!unlocked || !user) {
    return (
      <div data-surface="desk" className="min-h-screen">
        <DesktopLock onUnlock={handleUnlock} />
      </div>
    );
  }

  return (
    <DesktopChromeProvider>
      <div data-surface="desk" data-rail-pinned={pinned} className="relative min-h-screen">
        <DeskBackdrop />
        <a href="#desk-main" className="desk-skip">Saltar al contenido</a>

        <DeskRail
          user={user}
          pinned={pinned}
          onTogglePin={togglePin}
          onOpenPalette={() => setPaletteOpen(true)}
          onRelock={relock}
          onLogout={() => void handleLogout()}
          onSwitchToMobile={() => { setViewPreference("mobile"); router.replace("/manager"); }}
        />

        {/* El desplazamiento del contenido es instantáneo al fijar el rail: es
            una acción deliberada del usuario y animar una propiedad de maqueta
            solo añadiría jank sin comunicar nada. */}
        {/* relative z-10: el fondo es `fixed` con z-index 0, lo que crea un
            contexto de apilamiento; sin esto, el contenido estático quedaría
            pintado por DEBAJO de los resplandores. */}
        <div className="relative z-10 flex min-h-screen flex-col pl-(--desk-gutter)">
          <header className="sticky top-0 z-(--z-header) flex h-14 items-center gap-4 border-b border-line bg-card/85 px-6 backdrop-blur-xl xl:px-10">
            <div className="min-w-0 flex-1">
              {/* El título de sección es el ÚNICO texto con degradado de toda
                  la superficie, y por eso funciona: aparece en las 18 páginas
                  como firma, no como adorno repetido. Los colores se aclaran en
                  oscuro para que el barrido no abra un bache de contraste. */}
              <GradientText
                as="h1"
                via={isDark ? ["#709DF6", "#C7DBFF"] : ["#2563EB", "#93BBFF"]}
                className="block truncate text-lead font-semibold leading-tight tracking-[-0.02em]"
              >
                {section.title}
              </GradientText>
              {section.subtitle ? (
                <p className="truncate text-caption text-muted">{section.subtitle}</p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden text-right leading-tight xl:block">
                {user.storeName ? (
                  <p className="text-ui font-medium text-ink">{user.storeName}</p>
                ) : null}
                {/* first-letter y no `capitalize`: capitalize pone mayúscula en
                    CADA palabra y deja "Jueves, 30 De Julio". */}
                <p className="text-caption lowercase text-muted first-letter:uppercase">{todayLabel}</p>
              </div>
              <FreshnessPill />
              <button
                type="button"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                className="grid size-9 place-items-center rounded-xl border border-line bg-panel text-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                {isDark ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <DesktopNotifications />
            </div>
          </header>

          <main id="desk-main" tabIndex={-1} className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-7 xl:px-10">
            {children}
            <p className="pt-10 text-center text-caption text-muted">
              © {new Date().getFullYear()} CLARVEX · Jesús Adrián Hernández Luna. Todos los derechos reservados.
            </p>
          </main>
        </div>

        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} user={user} />
      </div>
    </DesktopChromeProvider>
  );
}
