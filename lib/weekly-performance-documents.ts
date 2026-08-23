export function weeklyReportChanged<T>(value: unknown, current: T) {
  const saved = reportFromSnapshot(value);
  return !sameReportValue(saved, current);
}

function reportFromSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = (value as Record<string, unknown>).report;
  return report && typeof report === "object" ? report : null;
}

function sameReportValue(left: unknown, right: unknown): boolean {
  if (typeof left === "number" && typeof right === "number") {
    if (!Number.isFinite(left) || !Number.isFinite(right)) return Object.is(left, right);
    // Las sumas de moneda pueden volver de Prisma como 213319.71 mientras el
    // cálculo en memoria produce 213319.71000000002. Un microcentavo no es un
    // cambio del RDS; un centavo real sí debe marcarlo como pendiente.
    return Math.abs(left - right) <= 0.000001;
  }
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => sameReportValue(item, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) =>
    key === rightKeys[index] && sameReportValue(leftRecord[key], rightRecord[key]));
}
