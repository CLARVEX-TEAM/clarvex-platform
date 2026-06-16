"use client";

import { useEffect, useMemo, useRef, type ElementRef } from "react";
import { Canvas } from "@react-three/fiber";
import { CameraControls, ContactShadows, Html } from "@react-three/drei";
import type { Fixture } from "@/components/StoreMap";

const GAP = 2.4;
const BOX_W = 1.7;
const BOX_D = 1.7;
const BOX_H = 1.3;

type Positioned = { fixture: Fixture; x: number; z: number };

export default function Scene3D({
  fixtures,
  selectedId,
  onSelect
}: {
  fixtures: Fixture[];
  selectedId: string | null;
  onSelect: (fixture: Fixture) => void;
}) {
  const { placed, floorW, floorD } = useMemo(() => {
    const maxCol = Math.max(1, ...fixtures.map((f) => f.col));
    const maxRow = Math.max(1, ...fixtures.map((f) => f.row));
    const offX = ((maxCol - 1) * GAP) / 2;
    const offZ = ((maxRow - 1) * GAP) / 2;
    const placed: Positioned[] = fixtures.map((fixture) => ({
      fixture,
      x: (fixture.col - 1) * GAP - offX,
      z: (fixture.row - 1) * GAP - offZ
    }));
    return { placed, floorW: maxCol * GAP + 4, floorD: maxRow * GAP + 4 };
  }, [fixtures]);

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 9, 12], fov: 45 }} style={{ touchAction: "none" }}>
      <color attach="background" args={["#f1f5fb"]} />
      <ambientLight intensity={0.75} />
      <directionalLight
        position={[7, 11, 6]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      {/* Piso */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[floorW, floorD]} />
        <meshStandardMaterial color="#e6edf8" />
      </mesh>
      <ContactShadows position={[0, 0.02, 0]} opacity={0.35} scale={Math.max(floorW, floorD)} blur={2.2} far={5} />

      {placed.map(({ fixture, x, z }) => (
        <Fixture3D
          key={fixture.id}
          fixture={fixture}
          x={x}
          z={z}
          selected={fixture.id === selectedId}
          dimmed={selectedId !== null && fixture.id !== selectedId}
          onSelect={() => onSelect(fixture)}
        />
      ))}

      <CameraRig selectedId={selectedId} placed={placed} />
    </Canvas>
  );
}

function Fixture3D({
  fixture,
  x,
  z,
  selected,
  dimmed,
  onSelect
}: {
  fixture: Fixture;
  x: number;
  z: number;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, BOX_H / 2, 0]}
        castShadow
        onClick={(event) => { event.stopPropagation(); onSelect(); }}
        onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      >
        <boxGeometry args={[BOX_W, BOX_H, BOX_D]} />
        <meshStandardMaterial color={selected ? "#2563EB" : "#93c5fd"} transparent opacity={dimmed ? 0.55 : 1} roughness={0.55} metalness={0.05} />
      </mesh>
      <Html center distanceFactor={11} position={[0, BOX_H + 0.55, 0]} occlude zIndexRange={[20, 0]}>
        <div className="pointer-events-none select-none whitespace-nowrap rounded-lg bg-white/95 px-2 py-1 text-center shadow-md ring-1 ring-black/5">
          <p className="text-[11px] font-black leading-tight text-slate-900">{fixture.name}</p>
          <p className="text-[10px] font-bold leading-tight text-blue-600">{fixture.styles.length} estilo{fixture.styles.length === 1 ? "" : "s"}</p>
        </div>
      </Html>
    </group>
  );
}

function CameraRig({ selectedId, placed }: { selectedId: string | null; placed: Positioned[] }) {
  const controls = useRef<ElementRef<typeof CameraControls>>(null);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (!selectedId) {
      void c.setLookAt(0, 9, 12, 0, 0, 0, true);
      return;
    }
    const target = placed.find((p) => p.fixture.id === selectedId);
    if (!target) return;
    void c.setLookAt(target.x + 2.6, 3.1, target.z + 3.6, target.x, 0.7, target.z, true);
  }, [selectedId, placed]);

  return <CameraControls ref={controls} makeDefault minDistance={2.5} maxDistance={26} maxPolarAngle={Math.PI / 2.05} />;
}
