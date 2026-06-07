"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImageUp, Store, UserRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Button, Card, ProfileAvatar } from "@/components/ui";

const roleLabels = { GERENTE: "Gerente", SUBGERENTE: "Subgerente", ASESOR: "Asesor" } as const;
const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
const maxBytes = 5 * 1024 * 1024;

export default function ProfilePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getSession().then(setUser).finally(() => setLoading(false));
  }, []);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setMessage("");
    setError("");
    if (!selected) return;
    if (!acceptedTypes.includes(selected.type)) {
      setError("Usa una imagen JPG, PNG o WEBP.");
      event.target.value = "";
      return;
    }
    if (selected.size > maxBytes) {
      setError("La imagen debe pesar menos de 5 MB.");
      event.target.value = "";
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function savePhoto() {
    if (!file) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const form = new FormData();
      form.set("photo", file);
      const response = await fetch("/api/profile/photo", { method: "POST", body: form });
      const payload = await response.json() as { photoUrl?: string; error?: string };
      if (!response.ok || !payload.photoUrl) throw new Error(payload.error ?? "No se pudo guardar la foto.");
      setUser((current) => current ? { ...current, photoUrl: payload.photoUrl } : current);
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (inputRef.current) inputRef.current.value = "";
      setMessage("Foto de perfil actualizada.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo guardar la foto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AppHeader title="Mi perfil" subtitle="Tu identidad dentro de CLARVEX Team." backHref={user?.role === "ASESOR" ? "/advisor" : "/manager"} />
      <AppFrame>
        {loading ? <Card className="text-sm font-semibold text-muted">Cargando perfil...</Card> : !user ? <Card className="text-sm font-semibold text-rose-700">No fue posible cargar tu perfil.</Card> : (
          <>
            <section className="mb-3 flex flex-col items-center px-4 py-5 text-center">
              <div className="relative">
                <ProfileAvatar name={user.name} photoUrl={previewUrl ?? user.photoUrl} size="lg" className="size-28 rounded-full ring-4 ring-white" />
                <span className="absolute bottom-0 right-0 grid size-9 place-items-center rounded-full bg-volt text-white ring-4 ring-white"><Camera size={16} /></span>
              </div>
              <h2 className="mt-3 text-xl font-black text-ink">{user.name}</h2>
              <Badge>{roleLabels[user.role]}</Badge>
            </section>

            <Card className="mb-3 divide-y divide-line p-3.5">
              <ProfileField icon={<UserRound size={17} />} label="Numero de empleado" value={user.employeeNumber} />
              <ProfileField icon={<Store size={17} />} label="Tienda" value={user.storeName ?? "CLARVEX Team"} />
            </Card>

            <Card className="p-3.5">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-blue-50 text-volt"><ImageUp size={19} /></span><div><h2 className="font-black text-ink">Foto de perfil</h2><p className="text-xs text-muted">JPG, PNG o WEBP. Maximo 5 MB.</p></div></div>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} className="sr-only" />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button type="button" variant="ghost" onClick={() => inputRef.current?.click()} disabled={saving}>{user.photoUrl ? "Cambiar foto" : "Elegir foto"}</Button>
                <Button type="button" variant="primary" onClick={savePhoto} disabled={!file || saving}>{saving ? "Guardando..." : "Guardar foto"}</Button>
              </div>
              {file ? <p className="mt-3 truncate text-xs font-semibold text-muted">Vista previa: {file.name}</p> : null}
              {message ? <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} />{message}</p> : null}
              {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
            </Card>
          </>
        )}
      </AppFrame>
      <BottomNav />
    </>
  );
}

function ProfileField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="grid size-9 place-items-center rounded-2xl bg-slate-100 text-muted">{icon}</span><div><p className="text-xs font-semibold text-muted">{label}</p><p className="font-black text-ink">{value}</p></div></div>;
}
