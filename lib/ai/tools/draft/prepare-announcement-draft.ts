import { z } from "zod";
import { defineTool, toolOk } from "@/lib/ai/tools/tool";
import { toSession } from "@/lib/ai/tools/session-adapter";
import { getAnnouncementContext } from "@/lib/services/draft-service";

const argsSchema = z.object({
  topic: z.string().trim().min(3).max(500),
  tone: z.enum(["formal", "motivacional", "urgente", "informativo"]).optional()
});

// FASE 2 (borradores): entrega el contexto de la tienda para que el modelo
// REDACTE un borrador de comunicado. No publica ni guarda nada: el usuario lo
// revisa y lo publica desde la pantalla de Comunicados.
export const prepareAnnouncementDraftTool = defineTool<z.infer<typeof argsSchema>>({
  name: "prepareAnnouncementDraft",
  description: "Reúne contexto de la tienda para redactar un BORRADOR de comunicado. No publica ni muestra el botón de confirmar. Si el usuario quiere generar/crear/publicar el comunicado, DESPUÉS debes llamar a proposeCreateAnnouncement con el título y cuerpo finales.",
  phase: 2,
  roles: ["GERENTE", "SUBGERENTE"],
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "Tema o intención del comunicado a redactar." },
      tone: { type: "string", enum: ["formal", "motivacional", "urgente", "informativo"], description: "Tono deseado. Opcional." }
    },
    required: ["topic"],
    additionalProperties: false
  },
  argsSchema,
  async execute(ctx, args) {
    const context = await getAnnouncementContext(toSession(ctx), args.topic);
    return toolOk({ ...context, tone: args.tone ?? "informativo", isDraft: true });
  }
});
