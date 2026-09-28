"use client";

import Image from "next/image";
import { photoSrc } from "@/lib/photo-src";
import { cn } from "@/lib/utils";

export function ProfileAvatar({
  name,
  photoUrl,
  size = "md",
  className = ""
}: {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const initials = name.slice(0, 2).toUpperCase();
  const src = photoSrc(photoUrl);
  const sizes = {
    sm: "size-10 rounded-2xl text-sm",
    md: "size-12 rounded-[1.15rem] text-base",
    lg: "size-20 rounded-[1.55rem] text-2xl"
  };

  if (src) {
    return (
      <span className={cn("relative block shrink-0 overflow-hidden ring-1 ring-black/5 dark:ring-white/10", sizes[size], className)}>
        <Image src={src} alt={name} fill sizes="80px" className="object-cover" unoptimized />
      </span>
    );
  }

  return (
    <span className={cn("grid shrink-0 place-items-center bg-volt/15 font-semibold text-volt shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_12px_28px_rgb(0_0_0/0.26)] ring-1 ring-volt/25", sizes[size], className)}>
      {initials}
    </span>
  );
}
