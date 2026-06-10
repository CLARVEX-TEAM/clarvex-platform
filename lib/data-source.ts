import { z } from "zod";

export const dataSourceTypes = ["HORARIOS", "KPIS", "METAS", "COMISIONES", "COMUNICADOS", "DESCUENTOS_POS"] as const;
export const dataSourceProviders = ["MANUAL", "EXCEL", "SHAREPOINT"] as const;
export const dataSourceStatuses = ["CONNECTED", "DISCONNECTED", "ERROR"] as const;
export const dataSourceFrequencies = ["MANUAL", "HOURLY", "DAILY", "WEEKLY"] as const;

export type DataSourceType = (typeof dataSourceTypes)[number];
export type DataSourceProvider = (typeof dataSourceProviders)[number];
export type DataSourceStatus = (typeof dataSourceStatuses)[number];
export type DataSourceFrequency = (typeof dataSourceFrequencies)[number];

export type SheetSummary = {
  name: string;
  rowCount: number;
};

export type ScheduleSyncMetrics = {
  weeksProcessed: number;
  employeesFound: number;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  errors: string[];
  employeesNotFound: string[];
  unknownValues: Record<string, number>;
};

export type KpiSyncMetrics = {
  sheetUsed: "Diario de ventas";
  weeksDetected: Array<{ weekNumber: number; weekStart: string; weekEnd: string }>;
  retailMonthLabel: string;
  retailMonthStart: string;
  retailMonthEnd: string;
  collaboratorsDetected: number;
  employeesProcessed: number;
  rowsRead: number;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  employeesNotFound: string[];
  errors: string[];
  crmTransactionsProcessed: number;
  totalSalesImported: number;
  totalGoalImported: number;
  ignoredRows: number;
  ttlsTraffic: number | null;
  ttlsMeta: number;
  ttlsSales: number;
  ttlsTransactions: number;
  ttlsPieces: number;
  ttlsCommissionMinimum: number | null;
};

export type DiscountSyncMetrics = {
  sheetsUsed: string[];
  weekNumbers: number[];
  employeesFound: number;
  recordsProcessed: number;
  recordsUpdated: number;
  employeesNotFound: string[];
  errors: string[];
};

export type DataSyncMetrics = ScheduleSyncMetrics | KpiSyncMetrics | DiscountSyncMetrics;

export type DataSourceRecord = {
  id: string;
  type: DataSourceType;
  provider: DataSourceProvider;
  name: string;
  url: string | null;
  status: DataSourceStatus;
  frequency: DataSourceFrequency;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  latestLog: {
    status: "SUCCESS" | "ERROR" | "RUNNING";
    message: string;
    recordsProcessed: number;
    createdAt: string;
    sheets: SheetSummary[];
    details: DataSyncMetrics | null;
  } | null;
};

export const dataSourceInput = z.object({
  type: z.enum(dataSourceTypes),
  provider: z.enum(dataSourceProviders),
  name: z.string().trim().min(2).max(100),
  url: z.union([z.string().trim().url("La URL no es valida."), z.literal("")]).optional(),
  frequency: z.enum(dataSourceFrequencies)
}).superRefine((data, context) => {
  if (data.provider !== "MANUAL" && !data.url) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "La URL es obligatoria para Excel y SharePoint." });
  }
});

type SerializableDataSource = {
  id: string;
  type: DataSourceType;
  provider: DataSourceProvider;
  name: string;
  url: string | null;
  status: DataSourceStatus;
  frequency: DataSourceFrequency;
  lastSyncAt: Date | null;
  nextSyncAt: Date | null;
  syncLogs?: Array<{
    status: "SUCCESS" | "ERROR" | "RUNNING";
    message: string;
    recordsProcessed: number;
    createdAt: Date;
  }>;
};

export function serializeDataSource(source: SerializableDataSource): DataSourceRecord {
  const latestLog = source.lastSyncAt ? source.syncLogs?.[0] : undefined;
  const logDetails = latestLog ? decodeSyncLogMessage(latestLog.message) : null;
  return {
    id: source.id,
    type: source.type,
    provider: source.provider,
    name: source.name,
    url: source.url,
    status: source.status,
    frequency: source.frequency,
    lastSyncAt: source.lastSyncAt?.toISOString() ?? null,
    nextSyncAt: source.nextSyncAt?.toISOString() ?? null,
    latestLog: latestLog && logDetails ? {
      ...latestLog,
      message: logDetails.message,
      sheets: logDetails.sheets,
      details: logDetails.details,
      createdAt: latestLog.createdAt.toISOString()
    } : null
  };
}

export function encodeSyncLogMessage(message: string, sheets: SheetSummary[] = [], details?: DataSyncMetrics) {
  return JSON.stringify({ message, sheets, details });
}

export function decodeSyncLogMessage(value: string): { message: string; sheets: SheetSummary[]; details: DataSyncMetrics | null } {
  try {
    const parsed = JSON.parse(value) as { message?: unknown; sheets?: unknown; details?: unknown };
    const sheets = Array.isArray(parsed.sheets)
      ? parsed.sheets.filter((sheet): sheet is SheetSummary => (
          typeof sheet === "object" && sheet !== null &&
          typeof (sheet as SheetSummary).name === "string" &&
          typeof (sheet as SheetSummary).rowCount === "number"
        ))
      : [];

    return {
      message: typeof parsed.message === "string" ? parsed.message : value,
      sheets,
      details: typeof parsed.details === "object" && parsed.details !== null ? parsed.details as DataSyncMetrics : null
    };
  } catch {
    return { message: value, sheets: [], details: null };
  }
}

export function getNextSyncAt(frequency: DataSourceFrequency, from = new Date()) {
  const intervals: Record<Exclude<DataSourceFrequency, "MANUAL">, number> = {
    HOURLY: 60 * 60 * 1000,
    DAILY: 24 * 60 * 60 * 1000,
    WEEKLY: 7 * 24 * 60 * 60 * 1000
  };
  return frequency === "MANUAL" ? null : new Date(from.getTime() + intervals[frequency]);
}
