/** Datos sensibles: solo para el archivo privado, nunca para logs o la respuesta de captura. */
export type PosVisionAttempt = {
  provider: "bedrock" | "gemini";
  model: string;
  startedAt: string;
  durationMs: number;
  text: string | null;
  textTruncated: boolean;
  accepted: boolean;
  problem: string | null;
};

export type PosVisionTrace = { attempts: PosVisionAttempt[] };

/** Acota memoria/disco incluso si un proveedor ignora su límite de salida. */
export function recordPosAttempt(trace: PosVisionTrace | undefined, attempt: Omit<PosVisionAttempt, "textTruncated">) {
  if (!trace || trace.attempts.length >= 8) return;
  const limit = 100_000;
  trace.attempts.push({
    ...attempt,
    text: attempt.text?.slice(0, limit) ?? null,
    textTruncated: (attempt.text?.length ?? 0) > limit,
    problem: attempt.problem?.slice(0, 12_000) ?? null
  });
}
