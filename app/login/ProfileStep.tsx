"use client";

import type React from "react";
import { motion } from "framer-motion";
import { Camera, Fingerprint } from "lucide-react";
import type { User } from "@/lib/types";
import { Badge, Button, ProfileAvatar } from "@/components/ui";

export function ProfileStep({
  user,
  photoPreview,
  biometricStatus,
  error,
  busy,
  isDark,
  card,
  fileInputRef,
  onPhotoChange,
  onBiometricSetup,
  onContinue
}: {
  user: User | null;
  photoPreview: string | null;
  biometricStatus: "idle" | "active" | "done";
  error: string;
  busy: boolean;
  isDark: boolean;
  card: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onPhotoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBiometricSetup: () => void;
  onContinue: () => void;
}) {
  return (
    <motion.div
      key="profile-setup"
      initial={{ opacity: 0, x: 48 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -48 }}
      transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-screen flex-col items-center justify-center px-5 py-10"
    >
      <div className={`w-full max-w-sm rounded-3xl p-6 ${card}`}>
        <div className="mb-5 flex items-center gap-4">
          <ProfileAvatar name={user?.name ?? "CL"} photoUrl={photoPreview ?? user?.photoUrl} size="lg" />
          <div>
            <h2 className={`text-xl font-black ${isDark ? "text-white" : "text-slate-900"}`}>
              {user?.name}
            </h2>
            <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Personaliza tu perfil
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="liquid-glass flex min-h-14 items-center justify-between rounded-2xl px-4 text-left"
          >
            <span className="flex items-center gap-3 font-bold">
              <Camera className="text-sky" size={18} />
              Agregar foto de perfil
            </span>
            {photoPreview ? <Badge tone="done">guardada</Badge> : <Badge tone="info">opcional</Badge>}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPhotoChange}
          />

          {biometricStatus === "done" ? (
            <div className="liquid-glass flex min-h-14 items-center justify-between rounded-2xl px-4">
              <span className="flex items-center gap-3 font-bold">
                <Fingerprint className="text-volt" size={18} />
                Biometría activada
              </span>
              <Badge tone="done">activa</Badge>
            </div>
          ) : (
            <button
              type="button"
              onClick={onBiometricSetup}
              disabled={busy}
              className="liquid-glass flex min-h-14 items-center justify-between rounded-2xl px-4 text-left"
            >
              <span className="flex items-center gap-3 font-bold">
                <Fingerprint className="text-purple" size={18} />
                {biometricStatus === "active" ? "Activando..." : "Activar Face ID / Huella"}
              </span>
              <Badge tone={biometricStatus === "active" ? "info" : undefined}>
                {biometricStatus === "active" ? "espera" : "opcional"}
              </Badge>
            </button>
          )}
        </div>

        {error ? <p className="mt-3 text-sm font-semibold text-red-500">{error}</p> : null}
        <Button
          className="mt-5 w-full rounded-2xl"
          variant="primary"
          onClick={onContinue}
        >
          Continuar
        </Button>
      </div>
    </motion.div>
  );
}
