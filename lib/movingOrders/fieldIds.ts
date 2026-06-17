/**
 * פייפליין הזדמנויות «לקוחות» — כאן יושבות ההזדמנויות למאגר מובילים בהתאמה להזמנות.
 */
export const PAYING_CUSTOMERS_PIPELINE_ID = "customers";

/**
 * שדות מותאמים להזדמנות — שאלון הצטרפות / וולקאם מוביל (אחרי upsertCustomField עם entity opportunity).
 * ערכים אלה נשמרים ב־ Firestore כ־ opportunity_...
 */
export const MOVER_WELCOME_OPPORTUNITY_FIELD_IDS = {
  fullName: "opportunity_mover_welcome_full_name",
  phone: "opportunity_mover_welcome_phone",
  email: "opportunity_mover_welcome_email",
  activityRegions: "opportunity_mover_welcome_activity_regions",
  activityRegionsJson: "opportunity_mover_welcome_activity_regions_json",
  activityDaysText: "opportunity_mover_welcome_activity_days_text",
  activityDaysJson: "opportunity_mover_welcome_activity_days_json",
  activityStart: "opportunity_mover_welcome_activity_start",
  activityEnd: "opportunity_mover_welcome_activity_end",
  activityFlexible: "opportunity_mover_welcome_activity_flexible",
  activityHours: "opportunity_mover_welcome_activity_hours",
  immediateAvailability: "opportunity_mover_welcome_immediate_availability",
  moverServices: "opportunity_mover_welcome_mover_services",
  workAvailabilityStatus: "opportunity_work_availability_status",
  currentPackageLeadsCount: "opportunity_package_current_leads_count",
  leadsCount: "opportunity_leads_count",
  notes: "opportunity_mover_welcome_notes",
} as const;

/**
 * מזהי מסמכים ב־customFields — שאלון וולקאם מוביל בלבד (למחיקה יזומה).
 * לא כולל לידים, חבילה, או שדות זמינות של פייפליין «לקוחות משלמים».
 */
export const MOVER_WELCOME_QUESTIONNAIRE_CUSTOM_FIELD_IDS: readonly string[] = Array.from(
  new Set([
    ...Object.values(MOVER_WELCOME_OPPORTUNITY_FIELD_IDS).filter((id) =>
      id.startsWith("opportunity_mover_welcome_")
    ),
    "opportunity_mover_welcome_crane",
  ])
);

/** שדות מותאמים לאנשי קשר — מובילים */
export const MOVER_FIELD_IDS = {
  isMover: "contact_mover_is_mover",
  regions: "contact_mover_regions",
  nationwide: "contact_mover_nationwide",
  days: "contact_mover_days",
  hourStart: "contact_mover_hour_start",
  hourEnd: "contact_mover_hour_end",
  flexibleHours: "contact_mover_flexible_hours",
  sameDay: "contact_mover_same_day",
  crane: "contact_mover_crane",
  large: "contact_mover_large",
  small: "contact_mover_small",
  apartment: "contact_mover_apartment",
} as const;

/**
 * שמות שדות הזדמנות (לקוחות משלמים) לפי הספק — עם נפילה לשדות וולקאם מוביל.
 */
export const MOVER_OPPORTUNITY_FIELD_IDS = {
  activityRegions: "opportunity_activity_regions",
  activityDaysText: "opportunity_activity_days_text",
  smallMover: "opportunity_small_mover",
  apartmentMover: "opportunity_apartment_mover",
  workAvailabilityStatus: "opportunity_work_availability_status",
  immediateAvailability: "opportunity_immediate_availability",
  currentPackageLeadsCount: "opportunity_package_current_leads_count",
  currentPackageSentLeadsCount: "opportunity_package_current_leads_count_sent",
  leadsCount: "opportunity_leads_count",
  /** קאונטר יומי להזמנות שנשלחו בהתאמה למוביל (מתאפס אוטומטית לפי יום ישראל) */
  dailyLeadsCount: "opportunity_daily_leads_count",
  /** שדה עזר פנימי לתאריך יום ישראל של הקאונטר היומי (YYYY-MM-DD) */
  dailyLeadsCountDayKey: "opportunity_daily_leads_count_day_key",
} as const;

/** כל מזהי השדות ב־Firestore (למיזוג אחרי validate ולוידוא קליטה) */
export const MOVER_CONTACT_FIELD_IDS: string[] = Object.values(MOVER_FIELD_IDS);
