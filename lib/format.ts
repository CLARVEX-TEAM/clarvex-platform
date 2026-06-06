export function money(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value);
}

export function completion(current: number, goal: number) {
  return goal > 0 ? Math.round((current / goal) * 100) : 0;
}
