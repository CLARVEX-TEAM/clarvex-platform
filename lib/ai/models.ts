import { AI_CONFIG, type ModelTier } from "@/lib/ai/config";

// Selección de modelo por REGLAS (barata y determinista, sin gastar cuota en un
// clasificador). Preguntas simples → modelo rápido (gpt-oss-20b); razonamiento
// complejo (comparaciones, tendencias, reportes, "por qué") → avanzado (120b).
const ADVANCED_PATTERN = /(compar|tendenc|proyec|pron[óo]stic|reporte|an[áa]lisis|estrategia|recomien|por qu[ée]|explica|deber[íi]a|escenario|comunicado|publicar|anunciar)/i;

export function selectModelTier(latestUserMessage: string): ModelTier {
  if (latestUserMessage.length > 320) return "advanced";
  if (ADVANCED_PATTERN.test(latestUserMessage)) return "advanced";
  return "fast";
}

export function modelForTier(tier: ModelTier): string {
  return tier === "advanced" ? AI_CONFIG.models.advanced : AI_CONFIG.models.fast;
}
