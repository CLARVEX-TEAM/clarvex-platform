import { z } from "zod";

export const dataSourceTypes = ["HORARIOS", "KPIS", "METAS", "COMISIONES", "COMUNICADOS"] as const;
export const dataSourceProviders = ["MANUAL", "EXCEL", "SHAREPOINT"] as const;
export const dataSourceStatuses = ["CONNECTED", "DISCONNECTED", "ERROR"] as const;

export type DataSourceType = (typeof dataSourceTypes)[number];
export type DataSourceProvider = (typeof dataSourceProviders)[number];
export type DataSourceStatus = (typeof dataSourceStatuses)[number];

export type DataSourceRecord = {
  id: string;
  type: DataSourceType;
  provider: DataSourceProvider;
  name: string;
  url: string | null;
  status: DataSourceStatus;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  latestLog: {
    status: "SUCCESS" | "ERROR" | "RUNNING";
    message: string;
    recordsProcessed: number;
    createdAt: string;
  } | null;
};

export const dataSourceInput = z.object({
  type: z.enum(dataSourceTypes),
  provider: z.enum(dataSourceProviders),
  name: z.string().trim().min(2).max(100),
  url: z.union([z.string().trim().url("La URL no es valida."), z.literal("")]).optional(),
  nextSyncAt: z.string().datetime().nullable().optional()
});

type SerializableDataSource = {
  id: string;
  type: DataSourceType;
  provider: DataSourceProvider;
  name: string;
  url: string | null;
  status: DataSourceStatus;
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
  return {
    id: source.id,
    type: source.type,
    provider: source.provider,
    name: source.name,
    url: source.url,
    status: source.status,
    lastSyncAt: source.lastSyncAt?.toISOString() ?? null,
    nextSyncAt: source.nextSyncAt?.toISOString() ?? null,
    latestLog: latestLog ? { ...latestLog, createdAt: latestLog.createdAt.toISOString() } : null
  };
}
