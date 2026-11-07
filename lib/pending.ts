import { PendingCategory, PendingPriority, PendingStatus } from "@prisma/client";
import { z } from "zod";

export const pendingInput = z.object({
  title: z.string().trim().min(3, "El titulo debe tener al menos 3 caracteres.").max(120),
  description: z.string().trim().min(3).max(2000),
  category: z.nativeEnum(PendingCategory),
  priority: z.nativeEnum(PendingPriority),
  status: z.nativeEnum(PendingStatus).optional(),
  ownerId: z.string().min(1),
  dueDate: z.string().date("La fecha limite no es valida."),
  /** Un CURSO es una matriz: la lista de sus cursos, en orden. */
  tipo: z.enum(["PENDIENTE", "CURSO"]).optional(),
  cursos: z.array(z.string().trim().min(2, "Cada curso necesita nombre.").max(80)).max(20).optional()
});

type CursoFila = { id: string; orden: number; nombre: string; completadoAt: Date | null };

export function serializarCursos(cursos: CursoFila[] | undefined) {
  return (cursos ?? []).slice().sort((a, b) => a.orden - b.orden).map((c) => ({ id: c.id, orden: c.orden, nombre: c.nombre, hecho: Boolean(c.completadoAt) }));
}

export function serializePending(item: {
  id: string;
  title: string;
  description: string;
  category: PendingCategory;
  priority: PendingPriority;
  ownerId: string;
  status: PendingStatus;
  dueDate: Date;
  tipo?: string;
  cierreSolicitadoAt?: Date | null;
  cursos?: CursoFila[];
}) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category.toLowerCase(),
    priority: item.priority.toLowerCase(),
    ownerId: item.ownerId,
    status: item.status.toLowerCase().replace("_", " "),
    dueDate: item.dueDate.toISOString().slice(0, 10),
    tipo: item.tipo === "CURSO" ? ("curso" as const) : ("pendiente" as const),
    cierreSolicitado: Boolean(item.cierreSolicitadoAt),
    cursos: serializarCursos(item.cursos)
  };
}
