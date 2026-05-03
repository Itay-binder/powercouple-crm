import type { LeadRecord } from "@/lib/leads/repo";

export type TemplateParamSource =
  | "manual"
  | "name"
  | "phone"
  | "email"
  | "status"
  | "contactCode"
  | "assignedRep";

/** מספר מקסימלי של {{n}} בגוף התבנית */
export function countBodyPlaceholders(bodyText: string): number {
  const re = /\{\{(\d+)\}\}/g;
  let max = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyText)) !== null) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return max;
}

function asSource(raw: unknown): TemplateParamSource {
  const s = String(raw ?? "").trim();
  if (
    s === "name" ||
    s === "phone" ||
    s === "email" ||
    s === "status" ||
    s === "contactCode" ||
    s === "assignedRep" ||
    s === "manual"
  ) {
    return s;
  }
  return "manual";
}

export function normalizeParameterSources(
  raw: unknown,
  slotCount: number
): TemplateParamSource[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: TemplateParamSource[] = [];
  for (let i = 0; i < slotCount; i++) {
    out.push(asSource(arr[i]));
  }
  return out;
}

export type TemplateForParams = {
  bodyText: string;
  exampleValues: string[];
  parameterSources?: TemplateParamSource[];
};

export function buildTemplateParametersForLead(
  lead: LeadRecord,
  template: TemplateForParams,
  broadcastFallback: string[]
): string[] {
  const n = countBodyPlaceholders(template.bodyText);
  const sources = template.parameterSources ?? [];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const src = sources[i] ?? "manual";
    const fallback = String(broadcastFallback[i] ?? template.exampleValues[i] ?? "").trim();
    if (src === "manual") {
      out.push(fallback);
      continue;
    }
    switch (src) {
      case "name":
        out.push(String(lead.name ?? ""));
        break;
      case "phone":
        out.push(String(lead.phone ?? ""));
        break;
      case "email":
        out.push(String(lead.email ?? ""));
        break;
      case "status":
        out.push(String(lead.status ?? ""));
        break;
      case "contactCode":
        out.push(String(lead.contactCode ?? ""));
        break;
      case "assignedRep":
        out.push(String(lead.assignedRep ?? ""));
        break;
      default:
        out.push(fallback);
    }
  }
  return out;
}
