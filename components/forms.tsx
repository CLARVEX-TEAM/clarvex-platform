"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { CalendarDays, Check, ChevronDown, Plus, X } from "lucide-react";
import Image from "next/image";
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
            ? "top-2 text-[10px] font-bold uppercase tracking-[0.1em] text-blue-500 dark:text-blue-400"
            : "top-[18px] text-[14px] font-normal text-slate-400 dark:text-slate-500"
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
          "min-h-14 w-full rounded-2xl border bg-slate-50 dark:bg-slate-800/50 px-4 pb-2.5 pt-6 text-sm font-semibold text-ink outline-none transition",
          focused
            ? "border-blue-500 dark:border-blue-400 ring-4 ring-blue-500/10 dark:ring-blue-400/10"
            : "border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600",
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
            ? "top-2 text-[10px] font-bold uppercase tracking-[0.1em] text-blue-500 dark:text-blue-400"
            : "top-[18px] text-[14px] font-normal text-slate-400 dark:text-slate-500"
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
          "min-h-[80px] w-full resize-none rounded-2xl border bg-slate-50 dark:bg-slate-800/50 px-4 pb-3 pt-6 text-sm font-semibold text-ink outline-none transition",
          focused
            ? "border-blue-500 dark:border-blue-400 ring-4 ring-blue-500/10 dark:ring-blue-400/10"
            : "border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600",
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  wrapperClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((opt) => opt.value === value);
  const hasPhoto = options.some((opt) => opt.photoUrl !== undefined);

  return (
    <>
      <div className={cn("relative", wrapperClassName)}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-slate-50 dark:bg-slate-800/50 px-4 text-left transition",
            open
              ? "border-blue-500 dark:border-blue-400 ring-4 ring-blue-500/10 dark:ring-blue-400/10"
              : "border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600"
          )}
        >
          {hasPhoto && selected ? (
            <AvatarSmall name={selected.label} photoUrl={selected.photoUrl} size={32} />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-500 dark:text-blue-400">{label}</p>
            <p className={cn("truncate text-sm font-semibold", selected ? "text-ink" : "text-slate-400 dark:text-slate-500")}>
              {selected?.label ?? placeholder}
            </p>
          </div>
          <ChevronDown
            size={16}
            className={cn("shrink-0 text-slate-400 transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 380 }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-[32px] bg-white dark:bg-[#1a2540] pb-10 shadow-2xl"
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
              </div>
              <p className="px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                {label}
              </p>
              <div className="max-h-[55vh] overflow-y-auto px-3">
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60 active:scale-[0.99]"
                  >
                    {opt.photoUrl !== undefined ? (
                      <AvatarSmall name={opt.label} photoUrl={opt.photoUrl} size={44} />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black text-ink">{opt.label}</p>
                      {opt.description ? (
                        <p className="text-xs text-slate-400 dark:text-slate-500">{opt.description}</p>
                      ) : null}
                    </div>
                    {value === opt.value ? (
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-blue-500 text-white">
                        <Check size={13} />
                      </span>
                    ) : (
                      <span className="size-6 shrink-0 rounded-full border-2 border-slate-200 dark:border-slate-700" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
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
        "rounded-2xl border bg-slate-50 dark:bg-slate-800/50 px-4 py-3 transition",
        focused
          ? "border-blue-500 dark:border-blue-400 ring-4 ring-blue-500/10 dark:ring-blue-400/10"
          : "border-slate-200 dark:border-slate-700/60",
        wrapperClassName
      )}
    >
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-blue-500 dark:text-blue-400">{label}</p>
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
                className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 text-[12px] font-bold text-blue-700 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800/60"
              >
                {chip}
                <button
                  type="button"
                  onClick={() => removeChip(i)}
                  className="grid size-3.5 place-items-center rounded-full bg-blue-200 dark:bg-blue-800/80 text-blue-700 dark:text-blue-300 transition hover:bg-blue-300 dark:hover:bg-blue-700"
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
          className="min-h-8 flex-1 bg-transparent text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-slate-400 dark:placeholder:text-slate-500"
        />
        {inputValue.trim() ? (
          <button
            type="button"
            onClick={addChip}
            className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-500 text-white shadow-sm transition hover:bg-blue-600 active:scale-95"
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

  function openPicker() {
    const el = inputRef.current;
    if (!el) return;
    try {
      (el as HTMLInputElement & { showPicker(): void }).showPicker();
    } catch {
      el.click();
    }
  }

  return (
    <div className={cn("relative", wrapperClassName)}>
      <button
        type="button"
        onClick={openPicker}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 px-4 text-left transition hover:border-slate-300 dark:hover:border-slate-600"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-500">
          <CalendarDays size={17} />
        </span>
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-500 dark:text-blue-400">{label}</p>
          <p className={cn("text-sm font-semibold", formatted ? "text-ink" : "text-slate-400 dark:text-slate-500")}>
            {formatted || "Seleccionar fecha"}
          </p>
        </div>
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="absolute inset-0 cursor-pointer opacity-0"
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
      whileTap={{ scale: 0.95 }}
      whileHover={{ y: -1 }}
      transition={{ type: "spring", stiffness: 520, damping: 30, mass: 0.6 }}
      {...props}
      disabled={loading || success || props.disabled}
      className={cn(
        "tappable relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-2xl px-5 text-sm font-black tracking-[-0.01em] focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" && !success &&
          "btn-sheen bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-[0_8px_30px_rgba(37,99,235,0.35)] hover:shadow-[0_12px_36px_rgba(37,99,235,0.45)] focus:ring-blue-500/20",
        variant === "primary" && success &&
          "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-[0_8px_30px_rgba(34,197,94,0.35)] focus:ring-emerald-500/20",
        variant === "secondary" &&
          "border-2 border-slate-200 dark:border-slate-700 bg-transparent text-ink hover:border-blue-300 dark:hover:border-blue-700 focus:ring-blue-500/10",
        variant === "danger" &&
          "border border-rose-300/60 dark:border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/15 focus:ring-rose-500/20",
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
  if (photoUrl) {
    return (
      <span
        className="relative shrink-0 overflow-hidden rounded-full"
        style={{ width: size, height: size }}
      >
        <Image src={photoUrl} alt={name} fill sizes="48px" className="object-cover" />
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-blue-100 dark:bg-blue-950/50 font-black text-blue-600 dark:text-blue-400"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.32) }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
