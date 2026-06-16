// Vibración háptica sutil para confirmar acciones en móvil/PWA.
// No hace nada en navegadores sin soporte (ej. iOS Safari ignora vibrate).

export type HapticPattern = "light" | "medium" | "success" | "warning" | "error";

const presets: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 18,
  success: [12, 40, 24],
  warning: [20, 40, 20],
  error: [40, 30, 40]
};

// Acepta un preset nombrado ("success", "light"…) o un patrón numérico crudo.
export function haptic(pattern: HapticPattern | number | number[] = "light") {
  const value = typeof pattern === "string" ? presets[pattern] : pattern;
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(value);
    } catch {
      // ignorar
    }
  }
}
