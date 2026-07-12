/**
 * Manipulación del payload real de /export/xlsx (estructura anidada de DevTools).
 */

type JsonRecord = Record<string, unknown>;

export type PowerBiCalendarFilter = {
  day: number;
  month: number;
  year: number;
};

const CALENDAR_PROPERTIES = ["DAY", "MONTH R", "YEAR R"] as const;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asCommands(payload: JsonRecord): JsonRecord[] | null {
  const esqr = payload.executeSemanticQueryRequest;
  if (!isRecord(esqr)) return null;
  const queries = esqr.queries;
  if (!Array.isArray(queries) || queries.length === 0) return null;
  const first = queries[0];
  if (!isRecord(first)) return null;
  const query = first.Query;
  if (!isRecord(query)) return null;
  const commands = query.Commands;
  return Array.isArray(commands) ? (commands as JsonRecord[]) : null;
}

/** Localiza ExportDataCommand dentro de queries[0].Query.Commands[]. */
export function findExportDataCommand(payload: JsonRecord): JsonRecord | null {
  const commands = asCommands(payload);
  if (!commands) return null;
  for (const command of commands) {
    const exportCmd = command.ExportDataCommand;
    if (isRecord(exportCmd)) return exportCmd;
  }
  return null;
}

/** Localiza SemanticQueryDataShapeCommand.Query (Select, Where, OrderBy). */
export function findSemanticQuery(payload: JsonRecord): JsonRecord | null {
  const commands = asCommands(payload);
  if (!commands) return null;
  for (const command of commands) {
    const shape = command.SemanticQueryDataShapeCommand;
    if (!isRecord(shape)) continue;
    const query = shape.Query;
    if (isRecord(query)) return query;
  }
  return null;
}

function calendarLiteral(property: string, filter: PowerBiCalendarFilter): string | null {
  switch (property) {
    case "DAY":
      return `${filter.day}L`;
    case "MONTH R":
      return `${filter.month}L`;
    case "YEAR R":
      return `${filter.year}L`;
    default:
      return null;
  }
}

function patchWhereLiteral(whereEntry: unknown, filter: PowerBiCalendarFilter): boolean {
  if (!isRecord(whereEntry)) return false;
  const condition = whereEntry.Condition;
  if (!isRecord(condition)) return false;
  const inClause = condition.In;
  if (!isRecord(inClause)) return false;
  const expressions = inClause.Expressions;
  if (!Array.isArray(expressions) || expressions.length === 0) return false;
  const firstExpr = expressions[0];
  if (!isRecord(firstExpr)) return false;
  const column = firstExpr.Column;
  if (!isRecord(column) || typeof column.Property !== "string") return false;
  const literalValue = calendarLiteral(column.Property, filter);
  if (!literalValue) return false;

  const values = inClause.Values;
  if (!Array.isArray(values) || values.length === 0) return false;
  const firstRow = values[0];
  if (!Array.isArray(firstRow) || firstRow.length === 0) return false;
  const literal = firstRow[0];
  if (!isRecord(literal)) return false;
  const literalObj = literal.Literal;
  if (!isRecord(literalObj)) return false;
  literalObj.Value = literalValue;
  return true;
}

function buildFiltersDescription(filter: PowerBiCalendarFilter): string {
  return `Filtros aplicados: \nDAY es ${filter.day}\nMONTH R es ${filter.month}\nYEAR R es ${filter.year}`;
}

/**
 * Cambia filtros de calendario retail (DAY / MONTH R / YEAR R) en Where + FiltersDescription.
 */
export function patchRetailCalendarFilters<T extends JsonRecord>(
  template: T,
  filter: PowerBiCalendarFilter
): T {
  const next = structuredClone(template) as JsonRecord;
  const semanticQuery = findSemanticQuery(next);
  if (semanticQuery && Array.isArray(semanticQuery.Where)) {
    for (const entry of semanticQuery.Where) {
      patchWhereLiteral(entry, filter);
    }
  }

  const exportCmd = findExportDataCommand(next);
  if (exportCmd) {
    exportCmd.FiltersDescription = buildFiltersDescription(filter);
  }

  return next as T;
}

export type PowerBiExportPatch = {
  artifactId?: number | string;
  modelId?: number | string;
  exportDataType?: number;
  userPreferredLocale?: string;
  filtersDescription?: string;
  columns?: unknown;
  ordering?: unknown;
  where?: unknown;
  select?: unknown;
  orderBy?: unknown;
  executeSemanticQueryRequest?: unknown;
};

/**
 * Parchea plantilla copiada desde DevTools (soporta estructura anidada real).
 */
export function patchExportPayload<T extends JsonRecord>(template: T, patch: PowerBiExportPatch): T {
  const next = structuredClone(template) as JsonRecord;

  if (patch.artifactId !== undefined) next.artifactId = patch.artifactId;
  if (patch.exportDataType !== undefined) next.exportDataType = patch.exportDataType;
  if (patch.executeSemanticQueryRequest !== undefined) {
    next.executeSemanticQueryRequest = patch.executeSemanticQueryRequest;
  }

  const esqr = isRecord(next.executeSemanticQueryRequest) ? next.executeSemanticQueryRequest : null;
  if (esqr && patch.modelId !== undefined) esqr.modelId = patch.modelId;
  if (esqr && patch.userPreferredLocale !== undefined) {
    esqr.userPreferredLocale = patch.userPreferredLocale;
  }

  const exportCmd = findExportDataCommand(next);
  if (exportCmd) {
    if (patch.filtersDescription !== undefined) exportCmd.FiltersDescription = patch.filtersDescription;
    if (patch.columns !== undefined) exportCmd.Columns = patch.columns;
    if (patch.ordering !== undefined) exportCmd.Ordering = patch.ordering;
  }

  const semanticQuery = findSemanticQuery(next);
  if (semanticQuery) {
    if (patch.where !== undefined) semanticQuery.Where = patch.where;
    if (patch.select !== undefined) semanticQuery.Select = patch.select;
    if (patch.orderBy !== undefined) semanticQuery.OrderBy = patch.orderBy;
  }

  return next as T;
}

/** Resumen legible del payload (sin token). */
export function summarizeExportPayload(payload: JsonRecord): {
  artifactId: unknown;
  modelId: unknown;
  exportDataType: unknown;
  columns: string[];
  filtersDescription: string | null;
  calendarFilter: Partial<PowerBiCalendarFilter>;
} {
  const esqr = isRecord(payload.executeSemanticQueryRequest) ? payload.executeSemanticQueryRequest : null;
  const exportCmd = findExportDataCommand(payload);
  const semanticQuery = findSemanticQuery(payload);

  const columns: string[] = [];
  if (exportCmd && Array.isArray(exportCmd.Columns)) {
    for (const col of exportCmd.Columns) {
      if (isRecord(col) && typeof col.Name === "string") columns.push(col.Name);
    }
  }

  const calendarFilter: Partial<PowerBiCalendarFilter> = {};
  if (semanticQuery && Array.isArray(semanticQuery.Where)) {
    for (const entry of semanticQuery.Where) {
      if (!isRecord(entry)) continue;
      const condition = entry.Condition;
      if (!isRecord(condition)) continue;
      const inClause = condition.In;
      if (!isRecord(inClause)) continue;
      const expressions = inClause.Expressions;
      const values = inClause.Values;
      if (!Array.isArray(expressions) || !Array.isArray(values)) continue;
      const expr = expressions[0];
      const row = values[0];
      if (!isRecord(expr) || !Array.isArray(row) || !isRecord(row[0])) continue;
      const column = expr.Column;
      const literal = row[0].Literal;
      if (!isRecord(column) || !isRecord(literal) || typeof column.Property !== "string") continue;
      const raw = String(literal.Value ?? "").replace(/L$/, "");
      const num = Number(raw);
      if (!Number.isFinite(num)) continue;
      if (column.Property === "DAY") calendarFilter.day = num;
      if (column.Property === "MONTH R") calendarFilter.month = num;
      if (column.Property === "YEAR R") calendarFilter.year = num;
    }
  }

  return {
    artifactId: payload.artifactId ?? null,
    modelId: esqr?.modelId ?? null,
    exportDataType: payload.exportDataType ?? null,
    columns,
    filtersDescription:
      exportCmd && typeof exportCmd.FiltersDescription === "string" ? exportCmd.FiltersDescription : null,
    calendarFilter
  };
}

export { CALENDAR_PROPERTIES };
