/**
 * ממיר TSV (עמודות: שם_ישוב, אזור) ל-settlementRegions.json
 * שימוש: node scripts/tsv-to-settlement-json.mjs < lib/movingOrders/data/settlementRegions.source.tsv
 */
import { writeFileSync } from "fs";
import { createInterface } from "readline";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "lib", "movingOrders", "data", "settlementRegions.json");
const rows = [];
let first = true;

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  const t = line.replace(/\r$/, "");
  if (!t.trim()) continue;
  if (first) {
    first = false;
    if (/שם_ישוב|אזור/i.test(t) && t.includes("\t")) continue;
  }
  const tab = t.indexOf("\t");
  if (tab < 0) continue;
  const settlement = t.slice(0, tab).trim();
  const region = t.slice(tab + 1).trim();
  if (settlement && region) rows.push({ settlement, region });
}
writeFileSync(outPath, JSON.stringify(rows, null, 0), "utf8");
console.error(`Wrote ${rows.length} rows to ${outPath.pathname}`);
