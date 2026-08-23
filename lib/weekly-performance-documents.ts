export function weeklyReportChanged<T>(value: unknown, current: T) {
  const saved = reportFromSnapshot(value);
  return JSON.stringify(saved) !== JSON.stringify(current);
}

function reportFromSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = (value as Record<string, unknown>).report;
  return report && typeof report === "object" ? report : null;
}
