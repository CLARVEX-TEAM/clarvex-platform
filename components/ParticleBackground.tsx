"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number; alpha: number;
}

export function ParticleBackground({ dark = false }: { dark?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const N = 50;
    const DIST = 100;
    const ps: Particle[] = [];
    let raf = 0;
    let W = 0;
    let H = 0;
    const rgb = dark ? "255,255,255" : "37,99,235";
    const lineAlpha = dark ? 0.15 : 0.1;

    function resize() {
      W = el!.width = window.innerWidth;
      H = el!.height = window.innerHeight;
    }

    function init() {
      ps.length = 0;
      for (let i = 0; i < N; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 0.15 + Math.random() * 0.25;
        ps.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          r: 1.5 + Math.random() * 1.5,
          alpha: 0.3 + Math.random() * 0.3,
        });
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);

      for (const p of ps) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
        else if (p.x > W) { p.x = W; p.vx = -Math.abs(p.vx); }
        if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy); }
        else if (p.y > H) { p.y = H; p.vy = -Math.abs(p.vy); }
      }

      for (let i = 0; i < ps.length - 1; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const dx = ps[i].x - ps[j].x;
          const dy = ps[i].y - ps[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < DIST * DIST) {
            ctx!.strokeStyle = `rgba(${rgb},${(1 - Math.sqrt(d2) / DIST) * lineAlpha})`;
            ctx!.lineWidth = 0.8;
            ctx!.beginPath();
            ctx!.moveTo(ps[i].x, ps[i].y);
            ctx!.lineTo(ps[j].x, ps[j].y);
            ctx!.stroke();
          }
        }
      }

      for (const p of ps) {
        ctx!.fillStyle = `rgba(${rgb},${p.alpha})`;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    resize();
    init();
    draw();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [dark]);

  return <canvas ref={ref} className="fixed inset-0 z-[5] pointer-events-none" />;
}
