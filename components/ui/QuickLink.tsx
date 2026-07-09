"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuickLink({ href, icon: Icon, label, className = "" }: { href: string; icon: LucideIcon; label: string; className?: string }) {
  return (
    <Link href={href} className={cn("tappable solid-card group flex min-h-12 items-center gap-2.5 rounded-[22px] px-3 text-[13px] font-black tracking-[-0.01em] text-ink/90", className)}>
      <span className="grid size-8 place-items-center rounded-[16px] border border-volt/20 bg-volt/12 text-volt shadow-[inset_0_1px_0_rgb(255_255_255_/_0.12)] transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
        <Icon size={17} />
      </span>
      {label}
    </Link>
  );
}

export function FloatingActionButton({ href, icon: Icon = Plus, label }: { href: string; icon?: LucideIcon; label: string }) {
  return (
    <Link href={href} className="tappable btn-sheen fixed bottom-20 right-4 z-20 flex min-h-12 items-center gap-2 overflow-hidden rounded-full bg-volt px-4 text-sm font-black text-white shadow-[0_10px_24px_rgb(37_99_235_/_0.32)] hover:bg-[#1D4ED8]">
      <Icon size={18} />
      {label}
    </Link>
  );
}
