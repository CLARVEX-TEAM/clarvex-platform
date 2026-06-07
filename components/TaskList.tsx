"use client";

import { useState } from "react";
import { TaskItem } from "@/components/ui";
import type { Activity } from "@/lib/types";
import { ResourceDiscussion } from "@/components/ResourceDiscussion";

export function TaskList({ activities }: { activities: Activity[] }) {
  const [items, setItems] = useState(activities);

  return (
    <div className="space-y-2">
      {items.map((activity) => (
        <div key={activity.id}>
          <TaskItem
            activity={activity}
            onToggle={async (completed) => {
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
          <ResourceDiscussion target={{ taskId: activity.id }} />
        </div>
      ))}
    </div>
  );
}
