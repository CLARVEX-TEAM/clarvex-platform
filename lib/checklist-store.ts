import { prisma } from "@/lib/prisma";
import { DEFAULT_CHECKLIST_ITEMS, type ChecklistItemKind, type ChecklistSection } from "@/lib/checklist";

export type StoreChecklistItem = {
  key: string;
  section: ChecklistSection;
  kind: ChecklistItemKind;
  label: string;
  sortOrder: number;
};

/**
 * Puntos ACTIVOS del checklist de una tienda, en orden. La primera vez que se
 * consulta una tienda sin puntos, se siembran los de por defecto — así las tiendas
 * nuevas quedan listas y las existentes conservan sus keys históricas.
 */
export async function loadStoreChecklistItems(storeId: string): Promise<StoreChecklistItem[]> {
  const existing = await prisma.checklistItem.count({ where: { storeId } });
  if (existing === 0) {
    await prisma.checklistItem.createMany({
      data: DEFAULT_CHECKLIST_ITEMS.map((item, index) => ({
        storeId, key: item.key, section: item.section, kind: item.kind, label: item.label, sortOrder: index
      })),
      skipDuplicates: true // por si dos peticiones siembran a la vez
    });
  }
  const rows = await prisma.checklistItem.findMany({
    where: { storeId, active: true },
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { key: true, section: true, kind: true, label: true, sortOrder: true }
  });
  return rows.map((row) => ({
    key: row.key,
    section: row.section as ChecklistSection,
    kind: row.kind as ChecklistItemKind,
    label: row.label,
    sortOrder: row.sortOrder
  }));
}

/** Un punto por su key (para validar y para el pie de foto del escaneo). */
export async function getStoreChecklistItem(storeId: string, key: string): Promise<StoreChecklistItem | null> {
  const row = await prisma.checklistItem.findUnique({
    where: { storeId_key: { storeId, key } },
    select: { key: true, section: true, kind: true, label: true, sortOrder: true, active: true }
  });
  if (!row || !row.active) return null;
  return {
    key: row.key,
    section: row.section as ChecklistSection,
    kind: row.kind as ChecklistItemKind,
    label: row.label,
    sortOrder: row.sortOrder
  };
}
