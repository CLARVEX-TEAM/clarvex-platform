// Vibración háptica sutil para confirmar acciones en móvil/PWA.
// No hace nada en navegadores sin soporte (ej. iOS Safari ignora vibrate).
export function haptic(pattern: number | number[] = 12) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignorar
    }
  }
}
