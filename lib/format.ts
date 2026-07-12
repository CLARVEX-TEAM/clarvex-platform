export function money(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function completion(current: number, goal: number) {
  return goal > 0 ? Math.round((current / goal) * 100) : 0;
}

// Semáforo de desempeño según el % de alcance: verde ≥100, ámbar ≥60, rojo <60.
export function performanceTone(pct: number): "mint" | "ember" | "orchid" {
  if (pct >= 100) return "mint";
  if (pct >= 60) return "ember";
  return "orchid";
}

export function performanceTextClass(pct: number): string {
  if (pct >= 100) return "text-success";
  if (pct >= 60) return "text-ember";
  return "text-orchid";
}
