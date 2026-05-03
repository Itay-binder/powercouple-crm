import {
  MOVER_FIELD_IDS,
  MOVER_WELCOME_OPPORTUNITY_FIELD_IDS,
} from "@/lib/movingOrders/fieldIds";

export type MoverWelcomeWebhookItem = {
  name?: string;
  phone?: string;
  email?: string;
  activity_regions_array?: string[];
  activity_regions?: string;
  activity_days_array?: string[];
  activity_days_text?: string;
  activity_start?: string;
  activity_end?: string;
  activity_flexible?: boolean;
  activity_hours?: string | null;
  immediate_availability?: string;
  available_for_leads?: string | boolean;
  work_availability_status?: string | boolean;
  leads_count?: number | string;
  package_current_leads_count?: number | string;
  mover_services?: string;
  notes?: string;
  /** אופציונלי — מזהה הזדמנות בפייפליין לקוחות משלמים (בדיקות / זימון מפורש) */
  opportunity_id?: string;
};

function jsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "null";
  }
}

/**
 * מיפוי גוף הוובהוק לערכי שדות מותאמים של ההזדמנות (מפתחות מלאים opportunity_...).
 * תמיד מחזיר את כל השדות — כל קליטה מעדכנת תמונת מצב מלאה מהשאלון.
 */
export function buildWelcomeOpportunityCustomValues(
  item: MoverWelcomeWebhookItem
): Record<string, unknown> {
  const F = MOVER_WELCOME_OPPORTUNITY_FIELD_IDS;
  const leadsCountRaw = item.leads_count;
  const leadsCount =
    typeof leadsCountRaw === "number"
      ? leadsCountRaw
      : typeof leadsCountRaw === "string" && leadsCountRaw.trim()
        ? Number(leadsCountRaw)
        : null;
  const packageLeadsRaw = item.package_current_leads_count;
  const packageLeadsCount =
    typeof packageLeadsRaw === "number"
      ? packageLeadsRaw
      : typeof packageLeadsRaw === "string" && packageLeadsRaw.trim()
        ? Number(packageLeadsRaw)
        : null;
  const workAvailabilityRaw =
    item.work_availability_status !== undefined
      ? item.work_availability_status
      : item.available_for_leads;
  return {
    [F.fullName]: String(item.name ?? ""),
    [F.phone]: String(item.phone ?? "").trim(),
    [F.email]: String(item.email ?? "").trim().toLowerCase(),
    [F.activityRegions]: String(item.activity_regions ?? ""),
    [F.activityRegionsJson]: jsonStringify(item.activity_regions_array ?? []),
    [F.activityDaysText]: String(item.activity_days_text ?? ""),
    [F.activityDaysJson]: jsonStringify(item.activity_days_array ?? []),
    [F.activityStart]: String(item.activity_start ?? ""),
    [F.activityEnd]: String(item.activity_end ?? ""),
    [F.activityFlexible]: Boolean(item.activity_flexible),
    [F.activityHours]:
      item.activity_hours === null || item.activity_hours === undefined
        ? ""
        : String(item.activity_hours),
    [F.immediateAvailability]: String(item.immediate_availability ?? ""),
    [F.workAvailabilityStatus]:
      workAvailabilityRaw === undefined || workAvailabilityRaw === null
        ? ""
        : String(workAvailabilityRaw),
    [F.leadsCount]: Number.isFinite(leadsCount) ? leadsCount : 0,
    [F.currentPackageLeadsCount]: Number.isFinite(packageLeadsCount) ? packageLeadsCount : 0,
    [F.moverServices]: String(item.mover_services ?? ""),
    [F.notes]: String(item.notes ?? ""),
  };
}

function parseServiceFlags(services: string): {
  apartment: boolean;
  crane: boolean;
  large: boolean;
  small: boolean;
} {
  const s = services.trim();
  if (!s) {
    return { apartment: false, crane: false, large: false, small: false };
  }
  return {
    apartment: /דירה|דירת/i.test(s),
    crane: /מנוף/i.test(s),
    large: /גדול|דירה|משרד|פנט|אחסון/i.test(s),
    small: /קטנ|קרטון|מיני|פרטי|פריטים/i.test(s),
  };
}

function immediateToSameDay(raw: string | undefined): boolean {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  return t === "כן" || t === "yes" || t === "true" || t === "1";
}

/**
 * עדכון שדות איש הקשר תחת MOVER_FIELD_IDS כדי ש־matchDrivers ימשיך לעבוד אחרי השאלון.
 */
export function buildMoverContactCustomPatchFromWelcome(
  item: MoverWelcomeWebhookItem
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    [MOVER_FIELD_IDS.isMover]: true,
  };

  const regions = item.activity_regions?.trim();
  if (regions) {
    out[MOVER_FIELD_IDS.regions] = regions;
    out[MOVER_FIELD_IDS.nationwide] = /כל\s+הארץ|ארצי|בכל הארץ/i.test(regions);
  } else if (item.activity_regions !== undefined) {
    out[MOVER_FIELD_IDS.regions] = "";
    out[MOVER_FIELD_IDS.nationwide] = false;
  }

  if (item.activity_days_text !== undefined) {
    out[MOVER_FIELD_IDS.days] = String(item.activity_days_text ?? "");
  }
  if (item.activity_start !== undefined) {
    out[MOVER_FIELD_IDS.hourStart] = String(item.activity_start ?? "");
  }
  if (item.activity_end !== undefined) {
    out[MOVER_FIELD_IDS.hourEnd] = String(item.activity_end ?? "");
  }
  if (item.activity_flexible !== undefined) {
    out[MOVER_FIELD_IDS.flexibleHours] = Boolean(item.activity_flexible);
  }
  if (item.immediate_availability !== undefined) {
    out[MOVER_FIELD_IDS.sameDay] = immediateToSameDay(item.immediate_availability);
  }

  const services = item.mover_services?.trim() ?? "";
  if (services) {
    const flags = parseServiceFlags(services);
    out[MOVER_FIELD_IDS.apartment] = flags.apartment;
    out[MOVER_FIELD_IDS.crane] = flags.crane;
    out[MOVER_FIELD_IDS.large] = flags.large;
    out[MOVER_FIELD_IDS.small] = flags.small;
  }

  return out;
}

export function normalizeMoverWelcomeItems(body: unknown): MoverWelcomeWebhookItem[] {
  if (Array.isArray(body)) {
    return body.filter((x) => x && typeof x === "object") as MoverWelcomeWebhookItem[];
  }
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (Array.isArray(o.items)) {
      return o.items.filter((x) => x && typeof x === "object") as MoverWelcomeWebhookItem[];
    }
    if (typeof o.phone === "string" || typeof o.opportunity_id === "string" || typeof o.name === "string") {
      return [o as MoverWelcomeWebhookItem];
    }
  }
  return [];
}
