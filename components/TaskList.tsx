"use client";

import { useState } from "react";
import { TaskItem } from "@/components/ui";
import type { Activity } from "@/lib/types";

export function TaskList({ activities }: { activities: Activity[] }) {
  const [items, setItems] = useState(activities);

  return (
    <div className="space-y-2">
      {items.map((activity) => (
        <TaskItem
          key={activity.id}
          activity={activity}
          onToggle={(completed) => {
            setItems((current) => current.map((item) => (item.id === activity.id ? { ...item, completed } : item)));
            fetch(`/api/activities/${activity.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ completed })
            }).catch(() => undefined);
          }}
        />
      ))}
    </div>
  );
}
