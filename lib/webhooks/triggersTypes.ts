/** טיפים ותוויות — בלי firebase-admin (בטוח ל-client). */

export type WebhookEventId =
  | "task_reminder_custom"
  | "task_reminder_deadline_15m"
  | "lead_created"
  | "lead_stage_changed"
  | "opportunity_created"
  | "opportunity_stage_changed"
  | "opportunity_pipeline_changed"
  | "moving_order_dispatch"
  | "moving_order_match_send"
  | "moving_order_match_cancel";

export type WebhookTriggerRow = {
  id: string;
  label: string;
  event: WebhookEventId;
  enabled: boolean;
  url: string;
};

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventId, string> = {
  task_reminder_custom: "תזכורת משימה (תאריך תזכורת)",
  task_reminder_deadline_15m: "15 דק׳ לפני דדליין משימה",
  lead_created: "ליד / איש קשר נקלט במערכת",
  lead_stage_changed: "שינוי שלב איש קשר (פייפליין לידים)",
  opportunity_created: "הזדמנות חדשה נוצרה",
  opportunity_stage_changed: "שינוי שלב בהזדמנות",
  opportunity_pipeline_changed: "הזדמנות הועברה לפייפליין אחר",
  moving_order_dispatch: "שליחת הזמנת הובלה למובילים (ניהול הזמנות)",
  moving_order_match_send: "התאמת הזמנות — שליחת הזמנה למובילים שנבחרו",
  moving_order_match_cancel: "התאמת הזמנות — דחיית הזמנה (לא אושרה)",
};

export const ALL_WEBHOOK_EVENTS: WebhookEventId[] = [
  "task_reminder_custom",
  "task_reminder_deadline_15m",
  "lead_created",
  "lead_stage_changed",
  "opportunity_created",
  "opportunity_stage_changed",
  "opportunity_pipeline_changed",
  "moving_order_dispatch",
  "moving_order_match_send",
  "moving_order_match_cancel",
];

/** כאשר אין טריגר מופעל לאירוע — שליחה לכתובת אלה (Make ברירת מחדל). */
export const WEBHOOK_EVENT_DEFAULT_URLS: Partial<Record<WebhookEventId, string>> = {
  moving_order_match_send: "https://hook.us1.make.com/7ig76p1u6ycbq5au3smo14ufelkdyer3",
  moving_order_match_cancel: "https://hook.us1.make.com/jjbdvct4ygbx7ee6wixpiao6zrcglxql",
};
