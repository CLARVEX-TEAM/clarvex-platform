import { z } from "zod";

export const FIXTURE_TYPES = ["WALL", "TABLE", "ROUND", "RACK", "CURVE", "COUNTER"] as const;
export type FixtureType = (typeof FIXTURE_TYPES)[number];

export const FIXTURE_TYPE_LABELS: Record<FixtureType, string> = {
  WALL: "Pared / muro",
  TABLE: "Mesa",
  ROUND: "Mesa redonda",
  RACK: "Rack de ropa",
  CURVE: "Rack en C (curvo)",
  COUNTER: "Mostrador / caja"
};

export type Fixture = {
  id: string;
  name: string;
  type: FixtureType;
  posX: number;
  posZ: number;
  rotation: number;
  styles: string[];
};

export const fixtureInput = z.object({
  name: z.string().trim().min(1, "Indica un nombre.").max(60),
  type: z.enum(FIXTURE_TYPES).default("TABLE"),
  posX: z.number().min(-200).max(200),
  posZ: z.number().min(-200).max(200),
  rotation: z.number().int().min(0).max(359).default(0),
  styles: z.array(z.string().trim().min(1).max(80)).max(80)
});

type FixtureRow = { id: string; name: string; type: string; posX: number; posZ: number; rotation: number; styles: string[] };

export function serializeFixture(fixture: FixtureRow): Fixture {
  return {
    id: fixture.id,
    name: fixture.name,
    type: fixture.type as FixtureType,
    posX: fixture.posX,
    posZ: fixture.posZ,
    rotation: fixture.rotation,
    styles: fixture.styles
  };
}
