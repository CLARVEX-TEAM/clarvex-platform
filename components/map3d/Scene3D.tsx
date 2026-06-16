"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Fixture } from "@/components/StoreMap";

// three.js "puro" (sin react-three-fiber): evita el choque de versiones de React
// que dejaba los internals (ReactCurrentBatchConfig) undefined.

const GAP = 2.6;
const COLOR_BASE = 0x93c5fd;
const COLOR_SEL = 0x2563eb;
const COLOR_GRAY = 0xb8c2d0;

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

/** Construye la geometría real de un mueble según su tipo. Devuelve sus mallas
 *  (cada una marcada con el id del mueble) y la altura para anclar la etiqueta. */
function buildFixture(id: string, type: string): { meshes: THREE.Mesh[]; labelY: number } {
  // Mallas en coordenadas LOCALES (centradas en 0). El grupo padre las coloca y gira.
  const meshes: THREE.Mesh[] = [];
  const bodyMat = () => new THREE.MeshStandardMaterial({ color: COLOR_BASE, roughness: 0.5, metalness: 0.08, transparent: true });
  const grayMat = () => new THREE.MeshStandardMaterial({ color: COLOR_GRAY, roughness: 0.4, metalness: 0.35, transparent: true });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, py: number, body: boolean, dx = 0, dz = 0, rotZ = 0, rotX = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(dx, py, dz);
    if (rotZ) m.rotation.z = rotZ;
    if (rotX) m.rotation.x = rotX;
    m.castShadow = true;
    m.userData.fixtureId = id;
    m.userData.body = body;
    meshes.push(m);
  };

  switch (type) {
    case "WALL":
      add(new THREE.BoxGeometry(2.0, 2.2, 0.22), bodyMat(), 1.1, true);
      return { meshes, labelY: 2.5 };
    case "ROUND":
      add(new THREE.CylinderGeometry(0.85, 0.85, 0.14, 36), bodyMat(), 0.6, true);
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 16), grayMat(), 0.3, false);
      return { meshes, labelY: 1.05 };
    case "RACK":
      add(new THREE.BoxGeometry(1.4, 0.9, 0.5), bodyMat(), 1.15, true); // ropa colgada
      add(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 12), grayMat(), 0.85, false, -0.7);
      add(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 12), grayMat(), 0.85, false, 0.7);
      add(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 12), grayMat(), 1.68, false, 0, 0, Math.PI / 2);
      return { meshes, labelY: 2.05 };
    case "CURVE": {
      // Rack en C: riel y ropa siguiendo un arco (para abrazar una mesa redonda).
      const arc = Math.PI * 1.25;
      const R = 0.95;
      add(new THREE.TorusGeometry(R, 0.26, 12, 30, arc), bodyMat(), 1.15, true, 0, 0, 0, Math.PI / 2); // ropa curva
      add(new THREE.TorusGeometry(R, 0.03, 8, 30, arc), grayMat(), 1.62, false, 0, 0, 0, Math.PI / 2); // riel
      [0, arc].forEach((a) => add(new THREE.CylinderGeometry(0.04, 0.04, 1.62, 12), grayMat(), 0.81, false, Math.cos(a) * R, Math.sin(a) * R)); // postes
      return { meshes, labelY: 2.0 };
    }
    case "COUNTER":
      add(new THREE.BoxGeometry(1.6, 1.0, 0.7), bodyMat(), 0.5, true);
      return { meshes, labelY: 1.3 };
    case "TABLE":
    default: {
      add(new THREE.BoxGeometry(1.8, 0.12, 1.0), bodyMat(), 0.55, true); // tablero
      const legs: Array<[number, number]> = [[0.8, 0.4], [-0.8, 0.4], [0.8, -0.4], [-0.8, -0.4]];
      legs.forEach(([dx, dz]) => add(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 10), grayMat(), 0.275, false, dx, dz));
      return { meshes, labelY: 0.95 };
    }
  }
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

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 400);

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
    // Vista general que encuadra toda la tienda según su tamaño.
    const span = Math.max(maxCol, maxRow) * GAP + 4;
    const overview = new THREE.Vector3(0, span * 0.62, span * 0.92);
    camera.position.copy(overview);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(maxCol * GAP + 4, maxRow * GAP + 4),
      new THREE.MeshStandardMaterial({ color: 0xe6edf8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const meshes: THREE.Mesh[] = [];
    const fixtureMeshes = new Map<string, THREE.Mesh[]>();
    const positions = new Map<string, THREE.Vector3>();
    const labels = new Map<string, HTMLDivElement>();

    fixtures.forEach((f) => {
      const x = (f.col - 1) * GAP - offX;
      const z = (f.row - 1) * GAP - offZ;
      const { meshes: fm, labelY } = buildFixture(f.id, f.type);
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.rotation.y = -((f.rotation || 0) * Math.PI) / 180;
      fm.forEach((m) => { group.add(m); meshes.push(m); });
      scene.add(group);
      fixtureMeshes.set(f.id, fm);
      positions.set(f.id, new THREE.Vector3(x, labelY, z));

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
    const targetPos = overview.clone();
    const targetLook = new THREE.Vector3(0, 0, 0);
    let flying = false;
    flyToRef.current = (id) => {
      if (!id) { targetPos.copy(overview); targetLook.set(0, 0, 0); }
      else {
        const p = positions.get(id);
        if (!p) return;
        targetPos.set(p.x + 2.8, p.y + 2.2, p.z + 3.8);
        targetLook.set(p.x, p.y * 0.45, p.z);
      }
      flying = true;
    };
    highlightRef.current = (id) => {
      fixtureMeshes.forEach((fm, fid) => {
        const isSel = fid === id;
        fm.forEach((m) => {
          const mat = m.material as THREE.MeshStandardMaterial;
          if (m.userData.body) mat.color.setHex(isSel ? COLOR_SEL : COLOR_BASE);
          mat.opacity = id && !isSel ? 0.45 : 1;
        });
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
