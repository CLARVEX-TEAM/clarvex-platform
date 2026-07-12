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

const inputPath = process.argv[2];
const source = inputPath ? readFileSync(inputPath, "utf8") : readFileSync(0, "utf8");

const analysis = analyzeDevToolsFetch(source);

console.log(JSON.stringify({
  url: analysis.url,
  method: analysis.method,
  essentialHeaders: analysis.essentialHeaders,
  removedHeaders: analysis.removedHeaders,
  dynamicFields: analysis.dynamicFields,
  reusableWithUrlTokenPayload: analysis.reusableWithUrlTokenPayload,
  notes: analysis.notes,
  payloadKeys: analysis.payload && typeof analysis.payload === "object"
    ? Object.keys(analysis.payload as Record<string, unknown>)
    : []
}, null, 2));
