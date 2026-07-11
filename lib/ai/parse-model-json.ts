/** Extrae JSON de la salida del modelo (puro, bloque ```json o primer objeto). */
export function parseModelJson<T = unknown>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      return JSON.parse(fenced[1].trim()) as T;
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    }
    throw new Error("No se pudo interpretar la respuesta JSON del modelo.");
  }
}

export function isJsonGenerationFailure(message: string): boolean {
  return /failed to generate json|failed_generation/i.test(message);
}
