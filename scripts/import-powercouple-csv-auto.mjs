import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && content[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function trimKey(h) {
  return String(h ?? "").replace(/^\uFEFF/, "").trim();
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function toAsciiKey(header, idx) {
  const cleaned = trimKey(header)
    .toLowerCase()
    .replace(/[\s\-./]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const base = cleaned || `col_${idx + 1}`;
  return `pc_${base}`;
}

function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Child script failed with code ${code}`));
    });
  });
}

async function main() {
  const file = argValue("--file");
  const baseUrl = (argValue("--baseUrl") || "").replace(/\/$/, "");
  const apiKey = argValue("--apiKey") || "";
  const databaseId = argValue("--databaseId") || "powercouple";
  const concurrency = argValue("--concurrency") || "4";
  const delayMs = argValue("--delay-ms") || "20";
  if (!file || !baseUrl || !apiKey || !databaseId) {
    console.error("Usage: --file --baseUrl --apiKey --databaseId [--concurrency] [--delay-ms]");
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(file), "utf8");
  const matrix = parseCsv(raw);
  if (matrix.length < 2) {
    console.error("CSV empty");
    process.exit(1);
  }
  const headers = matrix[0].map(trimKey);
  const records = matrix.slice(1).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  const hIndex = new Map(headers.map((h, i) => [h, i]));

  const known = new Set([
    "Opportunity Name",
    "Contact Name",
    "phone",
    "email",
    "pipeline",
    "stage",
    "Lead Value",
    "source",
    "assigned",
    "Created on",
    "Updated on",
    "lost reason ID",
    "lost reason name",
    "Followers",
    "Notes",
    "tags",
    "Engagement Score",
    "status",
    "Expected Close Date",
    "Forecast Probability",
    "Forecast Slippage Count",
    "Forecast Slippage (Days)",
    "landing page",
    "utm_source",
    "utm_campaign",
    "utm_medium",
    "utm_content",
    "Opportunity ID",
    "Contact ID",
    "Pipeline Stage ID",
    "Pipeline ID",
    "Days Since Last Stage Change Date",
    "Days Since Last Status Change Date",
    "Days Since Last Updated",
  ]);

  const contactLikely = new Set([
    "תז",
    "סטטוס משפחתי",
    "סטטוס תעסוקתי",
    "כתובת מגורים",
    "עיר מגורים",
    "הון עצמי",
    "תאריך אחרון שהשאיר פרטים",
    "תאריך ליד אחרון",
  ]);

  const customHeaders = headers.filter((h) => h && !known.has(h));
  const fieldsPayload = [];
  const fieldMap = { contact: {}, opportunity: {} };
  for (let i = 0; i < customHeaders.length; i++) {
    const h = customHeaders[i];
    const entityType = contactLikely.has(h) ? "contact" : "opportunity";
    const fieldId = toAsciiKey(h, i);
    fieldsPayload.push({
      fieldId,
      entityType,
      label: h,
      type: "text",
      isRequired: false,
      isActive: true,
    });
  }

  if (fieldsPayload.length > 0) {
    const res = await fetch(`${baseUrl}/api/ingest/custom-fields-upsert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-crm-tenant-database-id": databaseId,
      },
      body: JSON.stringify({ fields: fieldsPayload }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      throw new Error(j.error ?? "Failed to upsert custom fields");
    }
    for (const f of j.fields ?? []) {
      const col = fieldsPayload.find((x) => x.label === f.label);
      if (!col) continue;
      if (f.entityType === "contact") fieldMap.contact[col.label] = f.fieldId;
      else fieldMap.opportunity[col.label] = f.fieldId;
    }
  }

  const idxPipeName = hIndex.get("pipeline");
  const idxPipeId = hIndex.get("Pipeline ID");
  const idxStage = hIndex.get("stage");
  const byPipeId = new Map();
  if (idxPipeId != null) {
    for (const r of records) {
      const id = trimKey(r[idxPipeId] ?? "");
      if (!id) continue;
      const name = idxPipeName != null ? trimKey(r[idxPipeName] ?? "") : "";
      const stage = idxStage != null ? trimKey(r[idxStage] ?? "") : "";
      const prev = byPipeId.get(id) ?? { name: name || id, stages: new Set() };
      if (name) prev.name = name;
      if (stage) prev.stages.add(stage);
      byPipeId.set(id, prev);
    }
  }
  const pipelinesPayload = Array.from(byPipeId.entries()).map(([id, v]) => ({
    id,
    name: v.name,
    stages: Array.from(v.stages),
  }));
  if (pipelinesPayload.length > 0) {
    const pr = await fetch(`${baseUrl}/api/ingest/pipelines-upsert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-crm-tenant-database-id": databaseId,
      },
      body: JSON.stringify({ pipelines: pipelinesPayload }),
    });
    const pj = await pr.json();
    if (!pr.ok || !pj.ok) {
      throw new Error(pj.error ?? "Failed to upsert pipelines");
    }
  }

  const tmpDir = path.resolve("scripts");
  const fieldMapPath = path.join(tmpDir, ".tmp-powercouple-field-map.json");
  fs.writeFileSync(fieldMapPath, JSON.stringify(fieldMap, null, 2), "utf8");

  console.log("Prepared maps:", {
    customHeaders: customHeaders.length,
    contactMapped: Object.keys(fieldMap.contact).length,
    opportunityMapped: Object.keys(fieldMap.opportunity).length,
    pipelineMappings: pipelinesPayload.length,
  });

  await runNodeScript(path.resolve("scripts/import-powercouple-opportunities.mjs"), [
    "--file",
    path.resolve(file),
    "--baseUrl",
    baseUrl,
    "--apiKey",
    apiKey,
    "--databaseId",
    databaseId,
    "--field-map",
    fieldMapPath,
    "--concurrency",
    String(concurrency),
    "--delay-ms",
    String(delayMs),
    "--raw-notes",
  ]);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
