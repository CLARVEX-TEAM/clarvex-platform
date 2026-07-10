import { z } from "zod";
import { proposeCreateAnnouncement } from "@/lib/ai/actions";
import { defineTool, toolOk } from "@/lib/ai/tools/tool";

const argsSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(2000)
});

// FASE 3 (acciones con confirmación): PROPONE crear un comunicado. NO lo publica:
// registra una propuesta pendiente y devuelve un proposalId. El usuario debe
// confirmarla (endpoint aparte) para que el backend la ejecute y la audite.
export const proposeCreateAnnouncementTool = defineTool<z.infer<typeof argsSchema>>({
  name: "proposeCreateAnnouncement",
  description: "PROPONE la creación de un comunicado con el título y cuerpo indicados. NO lo publica: deja la acción pendiente de confirmación explícita del usuario. Úsala solo cuando el usuario pida crear/publicar un comunicado. Tras llamarla, informa al usuario que debe confirmar para publicarlo.",
  phase: 3,
  roles: ["GERENTE", "SUBGERENTE"],
  mutates: true,
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Título del comunicado (3-120 caracteres)." },
      body: { type: "string", description: "Cuerpo del comunicado (3-2000 caracteres)." }
    },
    required: ["title", "body"],
    additionalProperties: false
  },
  argsSchema,
  async execute(ctx, args) {
    const proposal = await proposeCreateAnnouncement(ctx, args);
    return toolOk({ ...proposal, preview: { title: args.title, body: args.body } });
  }
});
