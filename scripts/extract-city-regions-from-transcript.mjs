/**
 * חילוץ טבלת יישוב→אזור מקובץ transcript של Cursor (שורה עם user_query ו-שם_ישוב).
 * שימוש: node scripts/extract-city-regions-from-transcript.mjs path/to.jsonl
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outJson = join(__dirname, "..", "lib", "movingOrders", "data", "settlementRegions.json");

const p = process.argv[2];
if (!p) {
  console.error("Usage: node scripts/extract-city-regions-from-transcript.mjs <transcript.jsonl>");
  process.exit(1);
}

const lines = readFileSync(p, "utf8").split(/\r?\n/);
const hit = lines.find((l) => l.includes("שם_ישוב") && l.includes("user_query"));
if (!hit) {
  console.error("No matching line");
  process.exit(1);
}
const o = JSON.parse(hit);
const t = o.message.content[0].text;
const ix = t.indexOf("שם_ישוב");
const body = t.slice(ix);
const rows = [];
for (const ln of body.split("\n")) {
  const line = ln.replace(/\r$/, "");
  if (!line.trim()) continue;
  if (line.includes("</user_query>")) break;
  if (line.startsWith("שם_ישוב") && line.includes("אזור")) continue;
  const tab = line.indexOf("\t");
  if (tab < 0) continue;
  const settlement = line.slice(0, tab).trim();
  let region = line.slice(tab + 1).trim();
  const nl = region.indexOf("\n");
  if (nl >= 0) region = region.slice(0, nl);
  if (settlement && region) rows.push({ settlement, region });
}
writeFileSync(outJson, JSON.stringify(rows), "utf8");
console.error(`Wrote ${rows.length} rows to ${outJson}`);
