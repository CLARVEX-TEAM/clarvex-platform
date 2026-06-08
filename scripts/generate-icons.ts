import { Resvg } from "@resvg/resvg-js";
import fs from "fs";
import path from "path";

const publicDir = path.join(process.cwd(), "public");
const svgContent = fs.readFileSync(path.join(publicDir, "icon.svg"), "utf-8");

// Square background (no rounded corners) for maskable and apple-touch icons
const svgSquare = svgContent.replace(/rx="\d+(\.\d+)?"/, 'rx="0"');

function render(svg: string, size: number): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  return Buffer.from(resvg.render().asPng());
}

function makeIco(images: { size: number; data: Buffer }[]): Buffer {
  const n = images.length;
  let dataOffset = 6 + n * 16;
  const entries: Buffer[] = [];

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0);
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.data.length, 8);
    entry.writeUInt32LE(dataOffset, 12);
    entries.push(entry);
    dataOffset += img.data.length;
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(n, 4);

  return Buffer.concat([header, ...entries, ...images.map((img) => img.data)]);
}

function out(name: string, data: Buffer, subdir?: string) {
  const dir = subdir ? path.join(publicDir, subdir) : publicDir;
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, name);
  fs.writeFileSync(dest, data);
  console.log(`  ✓  ${path.relative(process.cwd(), dest)}`);
}

console.log("Generating Clarvex Team icons...\n");

// Standard PNGs (rounded corners)
out("favicon-16x16.png", render(svgContent, 16));
out("favicon-32x32.png", render(svgContent, 32));
out("icon-192.png", render(svgContent, 192));
out("icon-512.png", render(svgContent, 512));
out("icon-master-1024.png", render(svgContent, 1024), "branding");

// Square variants (no rounded corners)
out("apple-touch-icon.png", render(svgSquare, 180));
out("maskable-icon-512.png", render(svgSquare, 512));

// Multi-size favicon.ico (16 + 32, PNG-within-ICO)
const ico = makeIco([
  { size: 16, data: render(svgContent, 16) },
  { size: 32, data: render(svgContent, 32) },
]);
out("favicon.ico", ico);

console.log("\nDone.");
