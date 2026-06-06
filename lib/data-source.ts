import { z } from "zod";

export const dataSourceTypes = ["HORARIOS", "KPIS", "METAS", "COMISIONES", "COMUNICADOS"] as const;
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
  const latestLog = source.syncLogs?.[0];
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
      createdAt: latestLog.createdAt.toISOString()
    } : null
  };
}

export function encodeSyncLogMessage(message: string, sheets: SheetSummary[] = []) {
  return JSON.stringify({ message, sheets });
}

function decodeSyncLogMessage(value: string): { message: string; sheets: SheetSummary[] } {
  try {
    const parsed = JSON.parse(value) as { message?: unknown; sheets?: unknown };
    const sheets = Array.isArray(parsed.sheets)
      ? parsed.sheets.filter((sheet): sheet is SheetSummary => (
          typeof sheet === "object" && sheet !== null &&
          typeof (sheet as SheetSummary).name === "string" &&
          typeof (sheet as SheetSummary).rowCount === "number"
        ))
      : [];

    return {
      message: typeof parsed.message === "string" ? parsed.message : value,
      sheets
    };
  } catch {
    return { message: value, sheets: [] };
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
