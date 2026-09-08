import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { ActualizacionApp } from "@/components/ActualizacionApp";
import { CandadoHuella } from "@/components/CandadoHuella";
import { PageTransition } from "@/components/PageTransition";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { OfflineBanner } from "@/components/OfflineBanner";
import { WhatsNewModal } from "@/components/WhatsNewModal";
import { TermsGate } from "@/components/TermsGate";
import { GuessSchemeNotice } from "@/components/GuessSchemeNotice";
import { DesktopRouteGuard } from "@/components/desktop/DesktopRouteGuard";
import { DemoBanner } from "@/components/DemoBanner";
import { EmailBanner } from "@/components/EmailBanner";
import { DomainMoveBanner } from "@/components/DomainMoveBanner";
import { AppChrome } from "@/components/AppChrome";
import { SplashIntro } from "@/components/SplashIntro";
import { Meteors } from "@/components/magic/Meteors";
import { DotPattern } from "@/components/magic/DotPattern";

// Auto-alojada por next/font en el build: cero peticiones externas en runtime
// (compatible con el CSP font-src 'self') y sin FOUT en Android.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  title: "CLARVEX Team",
  description: "Operacion retail movil para equipos de tienda.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CLARVEX Team"
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B1220" },
    { media: "(prefers-color-scheme: light)", color: "#F5F8FF" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content"
};

/**
 * Aplica el tema ANTES del primer pintado.
 *
 * `ThemeProvider` pone la clase `dark` en un `useEffect`, y los efectos corren
 * después de pintar. Como `html { background: var(--bg) }`, durante esos
 * milisegundos se veía el fondo CLARO: un parpadeo blanco al abrir la app y al
 * cambiar de pantalla por primera vez. El fundido que tenía la transición lo
 * disimulaba; al quitarlo quedó a la vista.
 *
 * Va en línea y sin `defer` a propósito: tiene que ejecutarse de forma síncrona
 * antes de que el navegador pinte nada. Todo dentro de un try: si falla —modo
 * privado, almacenamiento bloqueado— se queda el tema claro, que es el
 * comportamiento de antes, nunca una pantalla rota.
 *
 * La lógica debe coincidir EXACTA con la de ThemeProvider; si divergen, el
 * parpadeo vuelve pero al revés.
 */
const THEME_SCRIPT = `(function(){try{
var t=localStorage.getItem('clarvex-theme');
var d=t==='dark'||((t==='system'||t===null||t===undefined)&&window.matchMedia('(prefers-color-scheme: dark)').matches);
if(d)document.documentElement.classList.add('dark');
}catch(e){}})();`;

/**
 * Decide si hay que tapar la app con el candado, ANTES del primer pintado.
 *
 * ⚠️ **Sin esto el candado parpadea en el navegador.** `CandadoHuella` no puede
 * saber en su estado inicial si hace falta --depende de `localStorage` y de que
 * exista el puente nativo, y las dos cosas son de cliente-- asi que pintaba el
 * velo siempre durante un instante. En Brave y en la PWA aparecia el candado y
 * se quitaba solo, que se lee como que la app se cuelga al abrir.
 *
 * Las dos condiciones se comprueban aqui igual que en el componente:
 * `isNativePlatform()` del puente de Capacitor y la misma clave de
 * `lib/candado-huella.ts`. Si divergen, vuelve el parpadeo o --peor-- el velo
 * se queda puesto donde no toca.
 */
const CANDADO_SCRIPT = `(function(){try{
var c=window.Capacitor;
if(c&&typeof c.isNativePlatform==='function'&&c.isNativePlatform()===true
   &&localStorage.getItem('clarvex-candado-huella')==='1'){
  document.documentElement.dataset.candado='1';
}
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={geist.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: CANDADO_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <SplashIntro />
            {/* Único fondo animado de la app. Antes había además blobs con GSAP;
                se retiraron para no tener dos sistemas continuos compitiendo por
                GPU durante toda la jornada. Respeta prefers-reduced-motion y se
                apaga con la pestaña oculta. */}
            {/* DotPattern es estático y Server Component: da profundidad sin
                sumar JavaScript ni animación continua. Va debajo de Meteors. */}
            <DotPattern />
            <Meteors />
            <PwaRegister />
            <ActualizacionApp />
            <CandadoHuella />
            <UpdatePrompt />
            <OfflineBanner />
            <DomainMoveBanner />
            <DesktopRouteGuard />
            <DemoBanner />
            <EmailBanner />
            <TermsGate />
            {/* Después de TermsGate a propósito: primero se aceptan los
                documentos legales, y solo entonces se pide capturar nada. */}
            <GuessSchemeNotice />
            <PageTransition>{children}</PageTransition>
            {/* Fuera de PageTransition: dentro, el transform del envoltorio
                animado crearía un containing block y rompería su position:fixed.
                Aquí sobrevive a las navegaciones, que es lo que permite animar
                la pastilla activa. */}
            <AppChrome />
            <WhatsNewModal />
            {/* El copiloto flotante se retiró el 26 de agosto de 2026: nadie lo
                usaba y su botón estorbaba en todas las pantallas. Se quitó el
                montaje, no el componente, para poder devolverlo con una línea.
                Esto NO desactiva la IA del resto de la app: el coach del
                asesor, la redacción de comunicados, los reportes de KPIs, la
                optimización de pendientes y el plan del día siguen igual, cada
                uno con su propio endpoint. */}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
