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
      const paths = [
        [
          { x: 72, y: 34, scale: 1.06, duration: 24 },
          { x: 28, y: 82, scale: 0.98, duration: 26 }
        ],
        [
          { x: -64, y: 58, scale: 1.09, duration: 28 },
          { x: -24, y: -36, scale: 1.02, duration: 30 }
        ],
        [
          { x: 48, y: -72, scale: 1.05, duration: 25 },
          { x: -56, y: -18, scale: 0.97, duration: 27 }
        ]
      ];

      blobs.forEach((blob, index) => {
        const timeline = gsap.timeline({ repeat: -1, yoyo: true });
        paths[index].forEach((step) => {
          timeline.to(blob, { ...step, ease: "sine.inOut", force3D: true });
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
