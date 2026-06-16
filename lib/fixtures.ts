import { z } from "zod";

export const fixtureInput = z.object({
  name: z.string().trim().min(1, "Indica un nombre.").max(60),
  col: z.number().int().min(1).max(24),
  row: z.number().int().min(1).max(40),
  styles: z.array(z.string().trim().min(1).max(80)).max(80)
});

type FixtureRow = { id: string; name: string; col: number; row: number; styles: string[] };

export function serializeFixture(fixture: FixtureRow) {
  return { id: fixture.id, name: fixture.name, col: fixture.col, row: fixture.row, styles: fixture.styles };
}
