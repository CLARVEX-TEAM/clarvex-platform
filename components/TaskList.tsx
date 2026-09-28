"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { TaskItem } from "@/components/ui";
import type { Activity } from "@/lib/types";
import { ResourceDiscussion } from "@/components/ResourceDiscussion";
import { haptic } from "@/lib/haptics";

export function TaskList({
  activities,
  canDelete = false,
  onDeleted
}: {
  activities: Activity[];
  canDelete?: boolean;
  onDeleted?: (id: string) => void;
}) {
  const [items, setItems] = useState(activities);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function remove(id: string) {
    if (deletingId) return;
    if (!window.confirm("¿Eliminar esta actividad? Esta acción no se puede deshacer.")) return;
    const previous = items;
    setDeletingId(id);
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      const response = await fetch(`/api/activities/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo eliminar la actividad.");
      onDeleted?.(id);
    } catch {
      setItems(previous);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {items.map((activity) => (
        <div key={activity.id}>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <TaskItem
                activity={activity}
                onToggle={async (completed) => {
                if (completed) haptic();
                const previous = items;
                setItems((current) => current.map((item) => (item.id === activity.id ? { ...item, completed } : item)));
                try {
                  const response = await fetch(`/api/activities/${activity.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed }) });
                  if (!response.ok) throw new Error("No se pudo actualizar la actividad.");
                } catch {
                  setItems(previous);
                }
                }}
              />
            </div>
            {canDelete ? (
              <button
                type="button"
                onClick={() => void remove(activity.id)}
                disabled={deletingId === activity.id}
                className="grid size-9 shrink-0 place-items-center rounded-xl border border-orchid/30 bg-orchid/10 text-orchid transition active:scale-95 disabled:opacity-50"
                aria-label="Eliminar actividad"
              >
                <Trash2 size={15} />
              </button>
            ) : null}
          </div>
          <ResourceDiscussion target={{ taskId: activity.id }} />
        </div>
      ))}
    </div>
  );
}
