import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { AnimatedBackground } from "@/components/AnimatedBackground";

export const metadata: Metadata = {
  title: "CLARVEX Team",
  description: "Operacion retail movil para equipos de tienda.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CLARVEX Team"
  }
};

export const viewport: Viewport = {
  themeColor: "#F5F8FF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AnimatedBackground />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
