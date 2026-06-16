"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={
          reduce
            ? { opacity: 0 }
            : { opacity: 0, y: 12, scale: 0.985, filter: "blur(6px)" }
        }
        animate={
          reduce
            ? { opacity: 1 }
            : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
        }
        exit={
          reduce
            ? { opacity: 0 }
            : { opacity: 0, y: -8, scale: 0.99, filter: "blur(4px)" }
        }
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
