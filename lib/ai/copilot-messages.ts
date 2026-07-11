/** Historial enviado al API del Copilot (máx. 20 turnos, como valida la ruta). */
export function toCopilotApiMessages(
  messages: Array<{ role: string; content: string }>,
  max = 20
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.content.trim().length > 0)
    .map((message) => ({ role: message.role as "user" | "assistant", content: message.content.trim() }))
    .slice(-max);
}
