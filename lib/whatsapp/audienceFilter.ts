import type { LeadRecord } from "@/lib/leads/repo";
import { normalizePhone } from "@/lib/leads/repo";

export type AudienceLogic = "and" | "or";

/** field: tag = label id for hasTag/notHasTag */
export type AudienceCondition = {
  id: string;
  field: "tag" | "name" | "phone" | "email" | "status" | "pipeline" | "stage" | "assignedRep";
  op:
    | "contains"
    | "notContains"
    | "equals"
    | "notEquals"
    | "isEmpty"
    | "notEmpty"
    | "hasTag"
    | "notHasTag";
  value: string;
};

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

function phoneNorm(s: unknown): string {
  const n = normalizePhone(String(s ?? ""));
  return n ? n : String(s ?? "").replace(/\D/g, "");
}

function evaluateOne(lead: LeadRecord, c: AudienceCondition): boolean {
  const v = c.value.trim();
  switch (c.field) {
    case "tag": {
      const labels = lead.labelIds ?? [];
      if (c.op === "hasTag") return labels.includes(v);
      if (c.op === "notHasTag") return !labels.includes(v);
      return false;
    }
    case "name": {
      const target = norm(lead.name);
      if (c.op === "isEmpty") return !target;
      if (c.op === "notEmpty") return Boolean(target);
      if (c.op === "contains") return target.includes(norm(v));
      if (c.op === "notContains") return !target.includes(norm(v));
      if (c.op === "equals") return target === norm(v);
      if (c.op === "notEquals") return target !== norm(v);
      return true;
    }
    case "phone": {
      const p = phoneNorm(lead.phone);
      const q = v.replace(/\D/g, "");
      if (c.op === "isEmpty") return !p;
      if (c.op === "notEmpty") return Boolean(p);
      if (!q) return c.op === "notContains" || c.op === "notEquals";
      if (c.op === "contains") return p.includes(q);
      if (c.op === "notContains") return !p.includes(q);
      if (c.op === "equals") return p === q;
      if (c.op === "notEquals") return p !== q;
      return true;
    }
    case "email": {
      const e = norm(lead.email);
      const needle = norm(v);
      if (c.op === "isEmpty") return !e;
      if (c.op === "notEmpty") return Boolean(e);
      if (c.op === "contains") return e.includes(needle);
      if (c.op === "notContains") return !e.includes(needle);
      if (c.op === "equals") return e === needle;
      if (c.op === "notEquals") return e !== needle;
      return true;
    }
    case "status": {
      const st = String(lead.status ?? "פתוח").trim();
      if (c.op === "isEmpty") return !st;
      if (c.op === "notEmpty") return Boolean(st);
      if (c.op === "equals") return st === v;
      if (c.op === "notEquals") return st !== v;
      if (c.op === "contains") return norm(st).includes(norm(v));
      if (c.op === "notContains") return !norm(st).includes(norm(v));
      return true;
    }
    case "pipeline": {
      const pid = String(lead.pipelineId ?? "").trim();
      if (c.op === "isEmpty") return !pid;
      if (c.op === "notEmpty") return Boolean(pid);
      if (c.op === "equals") return pid === v;
      if (c.op === "notEquals") return pid !== v;
      return true;
    }
    case "stage": {
      const s = String(lead.stage ?? "").trim();
      if (c.op === "isEmpty") return !s;
      if (c.op === "notEmpty") return Boolean(s);
      if (c.op === "contains") return norm(s).includes(norm(v));
      if (c.op === "notContains") return !norm(s).includes(norm(v));
      if (c.op === "equals") return norm(s) === norm(v);
      if (c.op === "notEquals") return norm(s) !== norm(v);
      return true;
    }
    case "assignedRep": {
      const r = norm(lead.assignedRep);
      if (c.op === "isEmpty") return !r;
      if (c.op === "notEmpty") return Boolean(r);
      if (c.op === "contains") return r.includes(norm(v));
      if (c.op === "notContains") return !r.includes(norm(v));
      if (c.op === "equals") return r === norm(v);
      if (c.op === "notEquals") return r !== norm(v);
      return true;
    }
    default:
      return true;
  }
}

export function filterLeadsByAudience(
  leads: LeadRecord[],
  conditions: AudienceCondition[],
  logic: AudienceLogic
): LeadRecord[] {
  if (!conditions.length) return leads;
  return leads.filter((lead) => {
    const results = conditions.map((c) => evaluateOne(lead, c));
    return logic === "and" ? results.every(Boolean) : results.some(Boolean);
  });
}
