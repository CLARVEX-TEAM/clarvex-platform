/**
 * Utilidades para analizar un fetch copiado desde DevTools (Chrome/Edge).
 * NO persiste ni registra el Bearer token.
 */

export type ParsedDevToolsFetch = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

export type FetchAnalysis = {
  url: string;
  method: string;
  essentialHeaders: Record<string, string>;
  removedHeaders: string[];
  payload: unknown;
  dynamicFields: string[];
  reusableWithUrlTokenPayload: boolean;
  notes: string[];
};

/** Headers que suelen bastar para POST export/xlsx con Bearer. */
const ESSENTIAL_HEADER_NAMES = new Set([
  "authorization",
  "content-type",
  "accept"
]);

/** Headers de navegador / sesión que normalmente NO hacen falta con Bearer. */
const BROWSER_NOISE_HEADERS = new Set([
  "accept-language",
  "cache-control",
  "pragma",
  "priority",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "referer",
  "origin",
  "cookie",
  "user-agent",
  "x-edge-shopping-flag",
  "x-requested-with"
]);

/**
 * Parsea un bloque copiado como "Copy as fetch" desde DevTools.
 * Acepta el objeto fetch(...) o JSON con url/headers/body.
 */
export function parseDevToolsFetch(source: string): ParsedDevToolsFetch {
  const trimmed = source.trim();

  const jsonMatch = trimmed.match(/^\{[\s\S]*\}$/);
  if (jsonMatch) {
    const parsed = JSON.parse(trimmed) as {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
    };
    if (!parsed.url) throw new Error("El JSON no incluye url.");
    return {
      url: parsed.url,
      method: (parsed.method ?? "POST").toUpperCase(),
      headers: normalizeHeaderKeys(parsed.headers ?? {}),
      body: parseBody(parsed.body)
    };
  }

  const fetchMatch = trimmed.match(/fetch\s*\(\s*("([^"]+)"|'([^']+)')\s*,\s*(\{[\s\S]*\})\s*\)/);
  if (!fetchMatch) {
    throw new Error("Formato no reconocido. Pega 'Copy as fetch' desde DevTools o un JSON { url, headers, body }.");
  }

  const url = fetchMatch[2] ?? fetchMatch[3];
  const optionsLiteral = fetchMatch[4];
  // eslint-disable-next-line no-new-func -- solo para análisis manual de fetch pegado por operador
  const options = new Function(`return (${optionsLiteral});`)() as {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };

  return {
    url,
    method: (options.method ?? "GET").toUpperCase(),
    headers: normalizeHeaderKeys(options.headers ?? {}),
    body: parseBody(options.body)
  };
}

function normalizeHeaderKeys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
}

function parseBody(body: unknown): unknown {
  if (body === undefined || body === null) return null;
  if (typeof body === "object") return body;
  if (typeof body !== "string") return body;
  const text = body.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function collectJsonPaths(value: unknown, prefix = "", out: string[] = []): string[] {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectJsonPaths(item, `${prefix}[${index}]`, out));
    return out;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out.push(path);
      collectJsonPaths(child, path, out);
    }
  }
  return out;
}

const LIKELY_DYNAMIC_KEYS = /^(authorization|bearertoken|token|session|correlation|requestid|activityid|timestamp|nonce|artifactid|modelid|filter|filters|ordering|columns|exportdatacommand|executesemanticqueryrequest)$/i;

function isLikelyDynamicPath(path: string): boolean {
  const leaf = path.split(".").pop() ?? path;
  return LIKELY_DYNAMIC_KEYS.test(leaf) || /FiltersDescription|ExportDataCommand|executeSemanticQuery/i.test(path);
}

/**
 * Reduce headers al mínimo y señala campos dinámicos del payload.
 */
export function analyzeDevToolsFetch(source: string): FetchAnalysis {
  const parsed = parseDevToolsFetch(source);
  const essentialHeaders: Record<string, string> = {};
  const removedHeaders: string[] = [];

  for (const [key, value] of Object.entries(parsed.headers)) {
    if (ESSENTIAL_HEADER_NAMES.has(key)) {
      essentialHeaders[key] = key === "authorization" ? "Bearer <REDACTED>" : value;
      continue;
    }
    if (BROWSER_NOISE_HEADERS.has(key)) {
      removedHeaders.push(key);
      continue;
    }
    removedHeaders.push(key);
  }

  if (!essentialHeaders.authorization) {
    throw new Error("No se encontró header Authorization. La exportación requiere Bearer token.");
  }
  if (!essentialHeaders["content-type"]) {
    essentialHeaders["content-type"] = "application/json";
  }

  const paths = collectJsonPaths(parsed.body);
  const dynamicFields = paths.filter(isLikelyDynamicPath);

  const notes: string[] = [
    "Bearer token: dinámico, caduca (típicamente ~60–90 min). No persistir.",
    "artifactId / modelId: estables por visual/dataset; cambian si cambias de reporte.",
    "executeSemanticQueryRequest.queries[0].Query.Commands: SemanticQueryDataShapeCommand (Where/Select) + ExportDataCommand (Columns/Ordering/FiltersDescription).",
    "activityid / requestid: UUIDs de correlación por petición; normalmente opcionales sin Bearer.",
    "x-powerbi-hostenv: metadata del cliente web; no requerido en servidor.",
    "Headers sec-* , referer, origin, cookie: eliminables si usas Bearer en servidor."
  ];

  const reusableWithUrlTokenPayload =
    parsed.method === "POST" &&
    typeof parsed.url === "string" &&
    parsed.url.length > 0 &&
    parsed.body !== null &&
    typeof parsed.body === "object";

  return {
    url: parsed.url,
    method: parsed.method,
    essentialHeaders,
    removedHeaders,
    payload: parsed.body,
    dynamicFields: Array.from(new Set(dynamicFields)),
    reusableWithUrlTokenPayload,
    notes
  };
}

/** Headers mínimos para reutilizar en servidor (sin token en logs). */
export function minimalExportHeaders(bearerToken: string): Record<string, string> {
  const token = bearerToken.trim();
  if (!token) throw new Error("Bearer token vacío.");
  return {
    authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
    "content-type": "application/json",
    accept: "application/json, application/octet-stream, */*"
  };
}
