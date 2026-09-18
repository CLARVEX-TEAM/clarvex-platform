"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getSession, logout } from "@/lib/auth";
import { nativeDeviceFetch, registerNativeDevice } from "@/lib/native-device-client";
import { dispositivoClarvexNativo } from "@/lib/puente-nativo";

declare global {
  interface Window {
    __clarvexNativeDevice?: { status: "idle" | "registering" | "registered" | "error"; detail?: string };
  }
}

let running: Promise<void> | null = null;

function cached(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "registered";
  } catch {
    return false;
  }
}

function remember(key: string): void {
  try {
    sessionStorage.setItem(key, "registered");
  } catch {
    // El registro real vive en el servidor. Sin almacenamiento de sesión se
    // repetirá el upsert en otra navegación, pero la identidad sigue válida.
  }
}

async function ensureRegistered(): Promise<void> {
  if (!dispositivoClarvexNativo()) return;
  if (running) return running;
  running = (async () => {
    window.__clarvexNativeDevice = { status: "registering" };
    const session = await getSession();
    if (!session || session.demo) {
      window.__clarvexNativeDevice = { status: "idle" };
      return;
    }
    const identity = await dispositivoClarvexNativo()!.identidad();
    const cacheKey = `clarvex-native-device:${session.id}:${identity.installationId}:${identity.appBuild}`;
    if (cached(cacheKey)) {
      window.__clarvexNativeDevice = { status: "registered", detail: identity.installationId };
      return;
    }
    const device = await registerNativeDevice(session.checklistOnly ? "KIOSK" : "PERSONAL");
    remember(cacheKey);
    window.__clarvexNativeDevice = { status: "registered", detail: device.installationId };
  })()
    .catch((error: unknown) => {
      window.__clarvexNativeDevice = {
        status: "error",
        detail: error instanceof Error ? error.message : "No se pudo registrar el dispositivo."
      };
    })
    .finally(() => { running = null; });
  return running;
}

async function verifyActive(): Promise<void> {
  if (!dispositivoClarvexNativo()) return;
  try {
    const response = await nativeDeviceFetch("/api/app/native/device");
    if (response.ok) return;
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (response.status === 403 && payload.error?.includes("no está activo")) {
      await logout();
      window.location.replace("/login?device=revoked");
    }
  } catch (error) {
    // El challenge es quien detecta primero una revocación. Los fallos de red
    // se ignoran: nunca se cierra una sesión solo porque el teléfono perdió señal.
    if (error instanceof Error && error.message.includes("no está registrado para esta sesión")) {
      await logout();
      window.location.replace("/login?device=revoked");
    }
  }
}

/** Registro silencioso: no existe en navegador y nunca bloquea la interfaz. */
export function NativeDeviceRegistration() {
  const pathname = usePathname();
  useEffect(() => {
    void ensureRegistered().then(() => verifyActive());
  }, [pathname]);
  useEffect(() => {
    const retry = () => { void ensureRegistered(); };
    window.addEventListener("clarvex-online", retry);
    return () => window.removeEventListener("clarvex-online", retry);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => { void verifyActive(); }, 120_000);
    return () => window.clearInterval(timer);
  }, []);
  return null;
}
