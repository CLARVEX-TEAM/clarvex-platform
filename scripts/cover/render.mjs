import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const src = process.argv[2];
const out = process.argv[3];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 440 },
  deviceScaleFactor: 2 // retina: se ve nítido en GitHub
});
await page.goto(pathToFileURL(path.resolve(src)).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log("generado:", out);
