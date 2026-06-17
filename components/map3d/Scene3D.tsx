"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Fixture } from "@/lib/fixtures";

// three.js puro. Posición libre (posX/posZ), giro por mueble y etiqueta con el
// número de estilos. Render persistente: mover un mueble NO reconstruye la escena.

const COLOR_BASE = 0x93c5fd;
const COLOR_SEL = 0x2563eb;
const COLOR_GRAY = 0xb8c2d0;

/** Mallas en coords LOCALES según el tipo. El grupo padre las coloca y gira. */
function buildFixture(id: string, type: string): { meshes: THREE.Mesh[]; labelY: number } {
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
      add(new THREE.BoxGeometry(1.4, 0.9, 0.5), bodyMat(), 1.15, true);
      add(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 12), grayMat(), 0.85, false, -0.7);
      add(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 12), grayMat(), 0.85, false, 0.7);
      add(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 12), grayMat(), 1.68, false, 0, 0, Math.PI / 2);
      return { meshes, labelY: 2.05 };
    case "CURVE": {
      const arc = Math.PI * 1.25;
      const R = 0.95;
      add(new THREE.TorusGeometry(R, 0.26, 12, 30, arc), bodyMat(), 1.15, true, 0, 0, 0, Math.PI / 2);
      add(new THREE.TorusGeometry(R, 0.03, 8, 30, arc), grayMat(), 1.62, false, 0, 0, 0, Math.PI / 2);
      [0, arc].forEach((a) => add(new THREE.CylinderGeometry(0.04, 0.04, 1.62, 12), grayMat(), 0.81, false, Math.cos(a) * R, Math.sin(a) * R));
      return { meshes, labelY: 2.0 };
    }
    case "COUNTER":
      add(new THREE.BoxGeometry(1.6, 1.0, 0.7), bodyMat(), 0.5, true);
      return { meshes, labelY: 1.3 };
    case "TABLE":
    default: {
      add(new THREE.BoxGeometry(1.8, 0.12, 1.0), bodyMat(), 0.55, true);
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
  const fixturesRef = useRef(fixtures);
  fixturesRef.current = fixtures;
  const apiRef = useRef<{ sync: () => void; focus: (id: string | null) => void; highlight: (id: string | null) => void } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const host = container;
    let width = host.clientWidth || 1;
    let height = host.clientHeight || 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f1f5fb");
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 600);
    camera.position.set(0, 12, 16);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 2;
    controls.maxDistance = 90;

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(8, 14, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    scene.add(dir);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xeef2f9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const root = new THREE.Group();
    scene.add(root);

    const groups = new Map<string, THREE.Group>();
    const bodyMats = new Map<string, THREE.MeshStandardMaterial[]>();
    const allMats = new Map<string, THREE.MeshStandardMaterial[]>();
    const positions = new Map<string, THREE.Vector3>();
    const labels = new Map<string, HTMLDivElement>();

    const overview = new THREE.Vector3(0, 12, 16);
    const center = new THREE.Vector3(0, 0, 0);
    const targetPos = overview.clone();
    const targetLook = center.clone();
    let flying = false;
    let firstBuild = true;

    function disposeFixture(id: string) {
      const g = groups.get(id);
      if (g) {
        g.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
        });
        root.remove(g);
      }
      groups.delete(id); bodyMats.delete(id); allMats.delete(id); positions.delete(id);
      labels.get(id)?.remove();
      labels.delete(id);
    }

    function sync() {
      const list = fixturesRef.current;
      const ids = new Set(list.map((f) => f.id));
      Array.from(groups.keys()).forEach((id) => { if (!ids.has(id)) disposeFixture(id); });

      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      list.forEach((f) => {
        let g = groups.get(f.id);
        if (g && g.userData.type !== f.type) { disposeFixture(f.id); g = undefined; }
        if (!g) {
          const built = buildFixture(f.id, f.type);
          g = new THREE.Group();
          built.meshes.forEach((m) => g!.add(m));
          root.add(g);
          groups.set(f.id, g);
          bodyMats.set(f.id, built.meshes.filter((m) => m.userData.body).map((m) => m.material as THREE.MeshStandardMaterial));
          allMats.set(f.id, built.meshes.map((m) => m.material as THREE.MeshStandardMaterial));
          g.userData.labelY = built.labelY;
          const el = document.createElement("div");
          el.style.position = "absolute";
          el.style.transform = "translate(-50%, -120%)";
          el.style.pointerEvents = "none";
          el.style.whiteSpace = "nowrap";
          host.appendChild(el);
          labels.set(f.id, el);
        }
        g.userData.type = f.type;
        g.position.set(f.posX, 0, f.posZ);
        g.rotation.y = -((f.rotation || 0) * Math.PI) / 180;
        const labelY = g.userData.labelY as number;
        positions.set(f.id, new THREE.Vector3(f.posX, labelY, f.posZ));
        const el = labels.get(f.id);
        if (el) el.innerHTML = `<div style="background:rgba(255,255,255,.95);border-radius:999px;padding:2px 9px;box-shadow:0 2px 8px rgba(0,0,0,.18);font-size:11px;font-weight:900;color:#2563eb">${f.styles.length} estilo${f.styles.length === 1 ? "" : "s"}</div>`;
        minX = Math.min(minX, f.posX); maxX = Math.max(maxX, f.posX);
        minZ = Math.min(minZ, f.posZ); maxZ = Math.max(maxZ, f.posZ);
      });

      if (list.length > 0) {
        center.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
        const sp = Math.max(maxX - minX, maxZ - minZ) + 7;
        overview.set(center.x, sp * 0.62, center.z + sp * 0.92);
        if (firstBuild) { camera.position.copy(overview); controls.target.copy(center); firstBuild = false; }
      }
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0, downY = 0;
    const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; };
    const onUp = (e: PointerEvent) => {
      if (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(root.children, true)[0];
      if (!hit) return;
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.fixtureId) o = o.parent;
      const id = o?.userData.fixtureId as string | undefined;
      if (!id) return;
      const f = fixturesRef.current.find((x) => x.id === id);
      if (f) onSelectRef.current(f);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    function focus(id: string | null) {
      if (!id) { targetPos.copy(overview); targetLook.copy(center); }
      else {
        const p = positions.get(id);
        if (!p) return;
        targetPos.set(p.x + 3, p.y + 2.4, p.z + 4);
        targetLook.set(p.x, p.y * 0.45, p.z);
      }
      flying = true;
    }
    function highlight(id: string | null) {
      groups.forEach((_, fid) => {
        const isSel = fid === id;
        bodyMats.get(fid)?.forEach((m) => m.color.setHex(isSel ? COLOR_SEL : COLOR_BASE));
        allMats.get(fid)?.forEach((m) => { m.opacity = id && !isSel ? 0.45 : 1; });
      });
    }
    apiRef.current = { sync, focus, highlight };

    const ro = new ResizeObserver(() => {
      width = host.clientWidth || 1;
      height = host.clientHeight || 1;
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
      positions.forEach((p, id) => {
        const el = labels.get(id);
        if (!el) return;
        proj.copy(p).project(camera);
        const visible = proj.z < 1;
        el.style.display = visible ? "block" : "none";
        if (visible) {
          el.style.left = `${(proj.x * 0.5 + 0.5) * width}px`;
          el.style.top = `${(-proj.y * 0.5 + 0.5) * height}px`;
        }
      });
    };
    sync();
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      Array.from(groups.keys()).forEach(disposeFixture);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      apiRef.current = null;
    };
  }, []);

  useEffect(() => { apiRef.current?.sync(); }, [fixtures]);
  useEffect(() => { apiRef.current?.focus(selectedId); apiRef.current?.highlight(selectedId); }, [selectedId]);

  return <div ref={containerRef} className="relative h-full w-full" />;
}
