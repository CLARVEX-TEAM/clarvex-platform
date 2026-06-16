"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { haptic } from "@/lib/haptics";

const THRESHOLD = 70; // px que hay que jalar para disparar
const MAX_PULL = 110;

// Jalar-para-recargar en la PWA móvil. Solo actúa cuando la página está arriba del todo.
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void> | void; children: React.ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const triggered = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY <= 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        triggered.current = false;
      } else {
        startY.current = null;
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (startY.current === null || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) { setPull(0); return; }
      // Resistencia: cuesta más entre más se jala.
      const dist = Math.min(MAX_PULL, delta * 0.5);
      setPull(dist);
      if (dist >= THRESHOLD && !triggered.current) {
        triggered.current = true;
        haptic(10);
      }
    }
    async function onTouchEnd() {
      if (startY.current === null) return;
      const shouldRefresh = pull >= THRESHOLD;
      startY.current = null;
      if (shouldRefresh && !refreshing) {
        setRefreshing(true);
        setPull(THRESHOLD);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    }
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [pull, refreshing, onRefresh]);

  const visible = pull > 0 || refreshing;
  const ready = pull >= THRESHOLD;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center"
        style={{ height: visible ? pull : 0, opacity: visible ? 1 : 0, transition: startY.current === null ? "height 0.25s ease, opacity 0.25s ease" : undefined }}
      >
        <div className="mt-2 grid size-9 place-items-center rounded-full bg-white/90 text-volt shadow-md dark:bg-slate-800/90">
          {refreshing ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <ArrowDown size={18} className="transition-transform" style={{ transform: ready ? "rotate(180deg)" : "rotate(0deg)" }} />
          )}
        </div>
      </div>
      <div style={{ transform: visible ? `translateY(${pull}px)` : undefined, transition: startY.current === null ? "transform 0.25s ease" : undefined }}>
        {children}
      </div>
    </>
  );
}
