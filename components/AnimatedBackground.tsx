"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function AnimatedBackground() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const blobs = gsap.utils.toArray<HTMLElement>(".ambient-blob");
      const movements = [
        { x: 54, y: 38, scale: 1.08, duration: 20 },
        { x: -46, y: 52, scale: 1.12, duration: 24 },
        { x: 36, y: -42, scale: 1.06, duration: 22 }
      ];

      blobs.forEach((blob, index) => {
        gsap.to(blob, {
          ...movements[index],
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          force3D: true
        });
      });
    });
    return () => media.revert();
  }, { scope: container });

  return (
    <div ref={container} className="animated-background" aria-hidden="true">
      <span className="ambient-blob ambient-blob-one" />
      <span className="ambient-blob ambient-blob-two" />
      <span className="ambient-blob ambient-blob-three" />
    </div>
  );
}
