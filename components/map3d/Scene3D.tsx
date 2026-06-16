"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Fixture } from "@/components/StoreMap";

// three.js "puro" (sin react-three-fiber): evita el choque de versiones de React
// que dejaba los internals (ReactCurrentBatchConfig) undefined.

const GAP = 2.4;
const BOX_W = 1.7;
const BOX_D = 1.7;
const BOX_H = 1.3;
const COLOR_BASE = 0x93c5fd;
const COLOR_SEL = 0x2563eb;

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

export default function Scene3D({
  fixtures,
  selectedId,
  onSelect
}: {
  fixtures: Fixture[];
  selectedId: string | null;
  onSelect: (fixture: Fixture) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const flyToRef = useRef<((id: string | null) => void) | null>(null);
  const highlightRef = useRef<((id: string | null) => void) | null>(null);

  // Construye/destruye la escena cuando cambian los muebles.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let width = container.clientWidth || 1;
    let height = container.clientHeight || 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f1f5fb");

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    camera.position.set(0, 9, 12);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 2.5;
    controls.maxDistance = 32;

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(7, 12, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    scene.add(dir);

    const maxCol = Math.max(1, ...fixtures.map((f) => f.col));
    const maxRow = Math.max(1, ...fixtures.map((f) => f.row));
    const offX = ((maxCol - 1) * GAP) / 2;
    const offZ = ((maxRow - 1) * GAP) / 2;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(maxCol * GAP + 4, maxRow * GAP + 4),
      new THREE.MeshStandardMaterial({ color: 0xe6edf8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const meshes: THREE.Mesh[] = [];
    const positions = new Map<string, THREE.Vector3>();
    const labels = new Map<string, HTMLDivElement>();

    fixtures.forEach((f) => {
      const x = (f.col - 1) * GAP - offX;
      const z = (f.row - 1) * GAP - offZ;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D),
        new THREE.MeshStandardMaterial({ color: COLOR_BASE, roughness: 0.55, metalness: 0.05, transparent: true })
      );
      mesh.position.set(x, BOX_H / 2, z);
      mesh.castShadow = true;
      mesh.userData.fixtureId = f.id;
      scene.add(mesh);
      meshes.push(mesh);
      positions.set(f.id, new THREE.Vector3(x, BOX_H + 0.5, z));

      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.transform = "translate(-50%, -110%)";
      el.style.pointerEvents = "none";
      el.style.whiteSpace = "nowrap";
      el.innerHTML = `<div style="background:rgba(255,255,255,.95);border-radius:8px;padding:3px 8px;box-shadow:0 2px 8px rgba(0,0,0,.15);text-align:center"><div style="font-size:11px;font-weight:900;color:#0f172a;line-height:1.1">${escapeHtml(f.name)}</div><div style="font-size:10px;font-weight:700;color:#2563eb;line-height:1.1">${f.styles.length} estilo${f.styles.length === 1 ? "" : "s"}</div></div>`;
      container.appendChild(el);
      labels.set(f.id, el);
    });

    // Click (ignora arrastres) → seleccionar mueble.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; };
    const onUp = (e: PointerEvent) => {
      if (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes)[0];
      if (!hit) return;
      const id = hit.object.userData.fixtureId as string;
      const fixture = fixtures.find((f) => f.id === id);
      if (fixture) onSelectRef.current(fixture);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    // Objetivo de cámara (vuelo suave por lerp en el loop).
    const targetPos = new THREE.Vector3(0, 9, 12);
    const targetLook = new THREE.Vector3(0, 0, 0);
    let flying = false;
    flyToRef.current = (id) => {
      if (!id) { targetPos.set(0, 9, 12); targetLook.set(0, 0, 0); }
      else {
        const p = positions.get(id);
        if (!p) return;
        targetPos.set(p.x + 2.6, 3.1, p.z + 3.6);
        targetLook.set(p.x, 0.7, p.z);
      }
      flying = true;
    };
    highlightRef.current = (id) => {
      meshes.forEach((m) => {
        const mat = m.material as THREE.MeshStandardMaterial;
        const isSel = m.userData.fixtureId === id;
        mat.color.setHex(isSel ? COLOR_SEL : COLOR_BASE);
        mat.opacity = id && !isSel ? 0.5 : 1;
      });
    };

    const ro = new ResizeObserver(() => {
      width = container.clientWidth || 1;
      height = container.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    ro.observe(container);

    let raf = 0;
    const proj = new THREE.Vector3();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (flying) {
        camera.position.lerp(targetPos, 0.08);
        controls.target.lerp(targetLook, 0.08);
        if (camera.position.distanceTo(targetPos) < 0.05) flying = false;
      }
      controls.update();
      renderer.render(scene, camera);
      labels.forEach((el, id) => {
        const p = positions.get(id);
        if (!p) return;
        proj.copy(p).project(camera);
        const visible = proj.z < 1;
        el.style.display = visible ? "block" : "none";
        if (visible) {
          el.style.left = `${(proj.x * 0.5 + 0.5) * width}px`;
          el.style.top = `${(-proj.y * 0.5 + 0.5) * height}px`;
        }
      });
    };
    animate();

    highlightRef.current(selectedId);
    flyToRef.current(selectedId);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      labels.forEach((el) => el.remove());
      meshes.forEach((m) => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      flyToRef.current = null;
      highlightRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtures]);

  // Reacciona a la selección sin reconstruir la escena.
  useEffect(() => {
    flyToRef.current?.(selectedId);
    highlightRef.current?.(selectedId);
  }, [selectedId]);

  return <div ref={containerRef} className="relative h-full w-full" />;
}
