import { z } from "zod";

export const FIXTURE_TYPES = ["WALL", "TABLE", "ROUND", "RACK", "COUNTER"] as const;
export type FixtureType = (typeof FIXTURE_TYPES)[number];

export const FIXTURE_TYPE_LABELS: Record<FixtureType, string> = {
  WALL: "Pared / muro",
  TABLE: "Mesa",
  ROUND: "Mesa redonda",
  RACK: "Rack de ropa",
  COUNTER: "Mostrador / caja"
};

export const fixtureInput = z.object({
  name: z.string().trim().min(1, "Indica un nombre.").max(60),
  type: z.enum(FIXTURE_TYPES).default("TABLE"),
  col: z.number().int().min(1).max(24),
  row: z.number().int().min(1).max(40),
  styles: z.array(z.string().trim().min(1).max(80)).max(80)
});

type FixtureRow = { id: string; name: string; type: string; col: number; row: number; styles: string[] };

export function serializeFixture(fixture: FixtureRow) {
  return { id: fixture.id, name: fixture.name, type: fixture.type, col: fixture.col, row: fixture.row, styles: fixture.styles };
}
