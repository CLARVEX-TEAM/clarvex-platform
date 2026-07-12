#!/usr/bin/env tsx
/**
 * Analiza un fetch copiado desde DevTools (stdin o archivo).
 * Uso:
 *   pnpm exec tsx scripts/analyze-power-bi-fetch.ts < fetch.txt
 *   pnpm exec tsx scripts/analyze-power-bi-fetch.ts ./fetch.txt
 *
 * NO imprime el Bearer token real — solo <REDACTED>.
 */
import { readFileSync } from "node:fs";
import { analyzeDevToolsFetch } from "../lib/integrations/power-bi-fetch-parser";
import { summarizeExportPayload } from "../lib/integrations/power-bi-payload";

const inputPath = process.argv[2];
const source = inputPath ? readFileSync(inputPath, "utf8") : readFileSync(0, "utf8");

const analysis = analyzeDevToolsFetch(source);
const summary =
  analysis.payload && typeof analysis.payload === "object"
    ? summarizeExportPayload(analysis.payload as Record<string, unknown>)
    : null;

console.log(JSON.stringify({
  url: analysis.url,
  method: analysis.method,
  essentialHeaders: analysis.essentialHeaders,
  removedHeaders: analysis.removedHeaders,
  dynamicFields: analysis.dynamicFields.slice(0, 20),
  dynamicFieldCount: analysis.dynamicFields.length,
  reusableWithUrlTokenPayload: analysis.reusableWithUrlTokenPayload,
  notes: analysis.notes,
  payloadKeys: analysis.payload && typeof analysis.payload === "object"
    ? Object.keys(analysis.payload as Record<string, unknown>)
    : [],
  summary
}, null, 2));
