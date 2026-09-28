"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { CalendarDays, Check, ChevronDown, Plus, X } from "lucide-react";
import Image from "next/image";
import { photoSrc } from "@/lib/photo-src";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  photoUrl?: string | null;
}

// ─── AppInput ─────────────────────────────────────────────────────────────────

export function AppInput({
  label,
  wrapperClassName,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "placeholder"> & {
  label: string;
  wrapperClassName?: string;
}) {
  const [focused, setFocused] = useState(false);
  const lifted = focused || String(props.value ?? "").length > 0;

  return (
    <div className={cn("relative", wrapperClassName)}>
      <label
        className={cn(
          "pointer-events-none absolute left-4 transition-all duration-150 ease-out",
          lifted
            ? "top-2 text-[10px] font-bold uppercase tracking-widest text-muted"
            : "top-[18px] text-[14px] font-normal text-muted"
        )}
      >
        {label}
      </label>
      <input
        {...props}
        placeholder=""
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        className={cn(
          "min-h-14 w-full rounded-2xl border bg-panel px-4 pb-2.5 pt-6 text-sm font-semibold text-ink outline-hidden transition",
          focused
            ? "border-volt/30 ring-4 ring-volt/30"
            : "border-line hover:border-line dark:hover:border-line",
          props.className
        )}
      />
    </div>
  );
}

// ─── AppTextarea ──────────────────────────────────────────────────────────────

export function AppTextarea({
  label,
  wrapperClassName,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "placeholder"> & {
  label: string;
  wrapperClassName?: string;
}) {
  const [focused, setFocused] = useState(false);
  const lifted = focused || String(props.value ?? "").length > 0;
  const ref = useRef<HTMLTextAreaElement>(null);

  function autoResize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  return (
    <div className={cn("relative", wrapperClassName)}>
      <label
        className={cn(
          "pointer-events-none absolute left-4 transition-all duration-150 ease-out",
          lifted
            ? "top-2 text-[10px] font-bold uppercase tracking-widest text-muted"
            : "top-[18px] text-[14px] font-normal text-muted"
        )}
      >
        {label}
      </label>
      <textarea
        {...props}
        ref={ref}
        placeholder=""
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        onInput={(e) => { autoResize(); props.onInput?.(e); }}
        className={cn(
          "min-h-[80px] w-full resize-none rounded-2xl border bg-panel px-4 pb-3 pt-6 text-sm font-semibold text-ink outline-hidden transition",
          focused
            ? "border-volt/30 ring-4 ring-volt/30"
            : "border-line hover:border-line dark:hover:border-line",
          props.className
        )}
      />
    </div>
  );
}

// ─── AppSelect ────────────────────────────────────────────────────────────────

export function AppSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Seleccionar",
  wrapperClassName,
  renderTrigger,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  wrapperClassName?: string;
  /**
   * Sustituye el campo de alto completo por el control que se le pase, sin
   * tocar la hoja.
   *
   * ⚠️ Existe porque en `/admin` el puesto va DENTRO del renglón de cada
   * persona, junto a sus otros botones: el campo normal mide 56 px de alto y
   * ocupa todo el ancho, así que con dieciocho personas la lista se volvía
   * impracticable. Lo que hacía falta ahí no era otro selector, sino la misma
   * hoja abierta desde un botón pequeño.
   */
  renderTrigger?: (estado: { abrir: () => void; abierto: boolean; elegida: SelectOption | undefined }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const selected = options.find((opt) => opt.value === value);
  const hasPhoto = options.some((opt) => opt.photoUrl !== undefined);

  const modalContent = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-999 bg-black/60 backdrop-blur-xs"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 380 }}
            className="fixed inset-x-0 bottom-0 z-1000 rounded-t-[32px] bg-card pb-10 shadow-2xl"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-panel" />
            </div>
            <p className="px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
              {label}
            </p>
            <div className="max-h-[55vh] overflow-y-auto px-3">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-3 text-left transition hover:bg-panel dark:hover:bg-panel active:scale-[0.99]"
                >
                  {opt.photoUrl !== undefined ? (
                    <AvatarSmall name={opt.label} photoUrl={opt.photoUrl} size={44} />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{opt.label}</p>
                    {opt.description ? (
                      <p className="text-xs text-muted">{opt.description}</p>
                    ) : null}
                  </div>
                  {value === opt.value ? (
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-volt text-white">
                      <Check size={13} />
                    </span>
                  ) : (
                    <span className="size-6 shrink-0 rounded-full border-2 border-line" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (renderTrigger) {
    return (
      <>
        {renderTrigger({ abrir: () => setOpen(true), abierto: open, elegida: selected })}
        {mounted && typeof document !== "undefined"
          ? createPortal(modalContent, document.body)
          : null}
      </>
    );
  }

  return (
    <>
      <div className={cn("relative", wrapperClassName)}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-panel px-4 text-left transition",
            open
              ? "border-volt/30 ring-4 ring-volt/30"
              : "border-line hover:border-line dark:hover:border-line"
          )}
        >
          {hasPhoto && selected ? (
            <AvatarSmall name={selected.label} photoUrl={selected.photoUrl} size={32} />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
            <p className={cn("truncate text-sm font-semibold", selected ? "text-ink" : "text-muted")}>
              {selected?.label ?? placeholder}
            </p>
          </div>
          <ChevronDown
            size={16}
            className={cn("shrink-0 text-muted transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </div>

      {mounted && typeof document !== "undefined"
        ? createPortal(modalContent, document.body)
        : null}
    </>
  );
}

// ─── AppChipInput ─────────────────────────────────────────────────────────────

export function AppChipInput({
  label,
  chips,
  onChipsChange,
  wrapperClassName,
}: {
  label: string;
  chips: string[];
  onChipsChange: (chips: string[]) => void;
  wrapperClassName?: string;
}) {
  const [inputValue, setInputValue] = useState("");
  const [focused, setFocused] = useState(false);

  function addChip() {
    const trimmed = inputValue.trim();
    if (trimmed && !chips.includes(trimmed)) {
      onChipsChange([...chips, trimmed]);
    }
    setInputValue("");
  }

  function removeChip(index: number) {
    onChipsChange(chips.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); addChip(); }
    if (e.key === "Backspace" && inputValue === "" && chips.length > 0) removeChip(chips.length - 1);
  }

  return (
    <div
      className={cn(
        "rounded-2xl border bg-panel px-4 py-3 transition",
        focused
          ? "border-volt/30 ring-4 ring-volt/30"
          : "border-line",
        wrapperClassName
      )}
    >
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
      {chips.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          <AnimatePresence>
            {chips.map((chip, i) => (
              <motion.span
                key={`${chip}-${i}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="inline-flex items-center gap-1.5 rounded-full bg-volt/10 px-2.5 py-1 text-[12px] font-bold text-volt ring-1 ring-volt/30"
              >
                {chip}
                <button
                  type="button"
                  onClick={() => removeChip(i)}
                  className="grid size-3.5 place-items-center rounded-full bg-volt/10 text-volt transition hover:bg-volt dark:hover:bg-volt/12"
                >
                  <X size={9} />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={chips.length === 0 ? "Escribe y presiona Enter..." : "Agregar actividad..."}
          className="min-h-8 flex-1 bg-transparent text-sm font-semibold text-ink outline-hidden placeholder:font-normal placeholder:text-muted dark:placeholder:text-muted"
        />
        {inputValue.trim() ? (
          <button
            type="button"
            onClick={addChip}
            className="grid size-7 shrink-0 place-items-center rounded-full bg-volt text-white shadow-xs transition hover:bg-volt active:scale-95"
          >
            <Plus size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ─── AppDatePicker ────────────────────────────────────────────────────────────

export function AppDatePicker({
  label,
  value,
  onChange,
  wrapperClassName,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  wrapperClassName?: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formatted = value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })
    : "";

  /**
   * Abre el calendario del navegador.
   *
   * ⚠️ **En escritorio, pulsar un `input type="date"` NO abre el calendario.**
   * Solo lo abre el iconito de la derecha, y aquí el campo está invisible, así
   * que ese icono no existe para quien mira. Por eso hace falta `showPicker()`.
   *
   * El orden importa: `focus()` antes, porque en iOS —donde `showPicker()` no
   * existe— enfocar el campo es lo que abre la rueda de fechas. El `click()` del
   * final es la última red para navegadores viejos.
   */
  function openPicker() {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const conPicker = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof conPicker.showPicker === "function") {
      try {
        conPicker.showPicker();
        return;
      } catch {
        // Algunos navegadores lanzan si no lo consideran un gesto del usuario.
      }
    }
    el.click();
  }

  return (
    <div className={cn("relative", wrapperClassName)}>
      <button
        type="button"
        onClick={openPicker}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-panel px-4 text-left transition hover:border-line dark:hover:border-line"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-volt/10 text-volt">
          <CalendarDays size={17} />
        </span>
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
          <p className={cn("text-sm font-semibold", formatted ? "text-ink" : "text-muted")}>
            {formatted || "Seleccionar fecha"}
          </p>
        </div>
      </button>
      {/*
        ⚠️ `pointer-events-none` NO es cosmético: sin él **la fecha no se puede
        cambiar en escritorio**.

        El campo va superpuesto al botón con `inset-0` y, al ir después en el
        DOM, se lleva TODOS los clics. En el teléfono daba igual —tocar un campo
        de fecha abre el calendario solo— pero en escritorio pulsar el campo no
        abre nada: solo lo abre su icono, que aquí es invisible. Resultado: se
        pulsaba y no pasaba nada, sin ningún error.

        Sigue estando aquí, y no oculto del todo, porque es el que guarda el
        valor y el que valida el formulario. Lo único que cambia es que ahora
        los clics llegan al botón, que sí sabe abrir el calendario.
      */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="pointer-events-none absolute inset-0 opacity-0"
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}

// ─── AppButton ────────────────────────────────────────────────────────────────

export function AppButton({
  children,
  variant = "primary",
  loading = false,
  success = false,
  icon,
  className = "",
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  /** Muestra un ✓ y bloquea el botón: úsalo tras guardar / enviar con éxito. */
  success?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 520, damping: 30, mass: 0.6 }}
      {...props}
      disabled={loading || success || props.disabled}
      className={cn(
        "tappable relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-2xl px-5 text-sm font-semibold tracking-[-0.01em] focus:outline-hidden focus:ring-4 disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" && !success && "bg-volt text-white shadow-[0_2px_6px_rgb(20_21_26/0.10)] hover:bg-[#1D4ED8] focus:ring-volt/30",
        variant === "primary" && success && "bg-mint text-white focus:ring-mint/30",
        // Secundario = contorno azul, no un borde gris de 2 px: asi se lee como
        // una accion y no como el marco de un campo.
        variant === "secondary" &&
          "border border-volt/35 bg-card text-volt hover:bg-volt/6 focus:ring-volt/30",
        variant === "danger" &&
          "border border-orchid/30 bg-orchid/10 text-orchid hover:bg-orchid/15 focus:ring-orchid/30",
        className
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {loading ? (
          <motion.span
            key="loading"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : success ? (
          <motion.span
            key="success"
            initial={{ scale: 0, rotate: -35, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 480, damping: 20 }}
          >
            <Check size={18} />
          </motion.span>
        ) : icon ? (
          <motion.span key="icon" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
            {icon}
          </motion.span>
        ) : null}
      </AnimatePresence>
      {children}
    </motion.button>
  );
}

// ─── AvatarSmall (internal helper) ───────────────────────────────────────────

function AvatarSmall({ name, photoUrl, size = 36 }: { name: string; photoUrl?: string | null; size?: number }) {
  const src = photoSrc(photoUrl);
  if (src) {
    return (
      <span
        className="relative shrink-0 overflow-hidden rounded-full"
        style={{ width: size, height: size }}
      >
        <Image src={src} alt={name} fill sizes="48px" className="object-cover" unoptimized />
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-volt/10 font-semibold text-volt"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.32) }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
