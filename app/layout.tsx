import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { PageTransition } from "@/components/PageTransition";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { OfflineBanner } from "@/components/OfflineBanner";
import { WhatsNewModal } from "@/components/WhatsNewModal";
import { TermsGate } from "@/components/TermsGate";
import { GuessSchemeNotice } from "@/components/GuessSchemeNotice";
import { DesktopRouteGuard } from "@/components/desktop/DesktopRouteGuard";
import { ClarvexCopilot } from "@/components/ClarvexCopilot";
import { DemoBanner } from "@/components/DemoBanner";
import { EmailBanner } from "@/components/EmailBanner";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={geist.variable}>
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
            <UpdatePrompt />
            <OfflineBanner />
            <DesktopRouteGuard />
            <DemoBanner />
            <EmailBanner />
            <TermsGate />
            {/* Después de TermsGate a propósito: primero se aceptan los
                documentos legales, y solo entonces se pide capturar nada. */}
            <GuessSchemeNotice />
            <PageTransition>{children}</PageTransition>
            <WhatsNewModal />
            <ClarvexCopilot />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
