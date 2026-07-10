/** Normaliza nombre/número para comparar sin acentos ni mayúsculas. */
export function normalizePersonQuery(value: string): string {
  return value
    .normalize("NFD")
    // Quita marcas diacríticas sin usar \p{M} (target TS es5).
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Matchable = {
  id?: string;
  userId?: string;
  name?: string;
  userName?: string;
  employeeNumber?: string;
};

export function matchTeammatesByQuery<T extends Matchable>(people: T[], query: string): T[] {
  const q = normalizePersonQuery(query);
  if (!q) return [];
  const digits = q.replace(/\s/g, "");
  const isNumeric = /^\d+$/.test(digits);

  return people.filter((person) => {
    const id = person.id ?? person.userId ?? "";
    const name = normalizePersonQuery(person.name ?? person.userName ?? "");
    const emp = normalizePersonQuery(person.employeeNumber ?? "");

    if (isNumeric) {
      return emp === digits || id === digits;
    }

    if (!name) return false;
    if (name === q || name.includes(q)) return true;
    // "Alonso" → "ALONSO TREVIÑO"; "jazmin castro" → match por tokens
    const tokens = q.split(" ").filter(Boolean);
    return tokens.length > 0 && tokens.every((token) => name.includes(token));
  });
}
