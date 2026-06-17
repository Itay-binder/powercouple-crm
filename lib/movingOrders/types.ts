export type MovingOrderStatus = "pending" | "dispatched" | "completed" | "cancelled" | "rejected";

export type DriverMatchFlag = "ok" | "orange" | "red";

/** רמזי תצוגה לטאב התאמה (מחושבים ב־API) */
export type OrderMatchUiHints = {
  moveWeekdayHe: string;
  transportRegionsLine: string;
  /** עיר איסוף מקורבת (לאחר resolve) */
  pickupCity?: string;
  /** עיר פריקה מקורבת */
  dropCity?: string;
};

/** הזדמנות (מוביל) שמוצגת בטבלת הזמנות — מובילים שנשלחו בפועל מהתאמה */
export type OrderMatchedOpportunitySummary = {
  id: string;
  name: string;
  /** מזהה איש הקשר (מוביל) — תואם ל־sentMatchDriverIds ולסינון בלשונית «לפי מובילים» */
  contactId: string;
  /** אין הזדמנות בפייפליין לקוחות — הקישור יפתח את איש הקשר */
  linkToContact?: boolean;
};

/** גוף הזמנה כפי שנכנס מ-webhook חיצוני */
export type MovingOrderPayload = {
  order_id: string;
  moving_timing?: string;
  move_type?: string;
  pickup?: string;
  dropoff?: string;
  /** עיר איסוף (מפורשת) */
  pickup_city?: string;
  /** עיר פריקה (מפורשת) */
  dropoff_city?: string;
  /** יום בשבוע בהזמנה (למשל א׳–ש׳) */
  day_order?: string;
  date?: string;
  is_urgent?: string;
  crane_info?: string;
  needs_crane?: string;
  name?: string;
  phone?: string;
  notes?: string;
  what_moving?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  event_id?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  pickup_type?: string;
  pickup_floor?: string;
  pickup_access?: string;
  drop_type?: string;
  drop_floor?: string;
  drop_access?: string;
  cartons?: string;
  items_list?: string;
  items_text?: string;
  drive_folder_url?: string;
  drive_folder_id?: string;
  drive_folder_name?: string;
  drive_files_count?: number;
};

export type MovingOrderRecord = {
  id: string;
  orderId: string;
  pipelineId: string;
  stage: string;
  customValues?: Record<string, unknown>;
  status: MovingOrderStatus;
  payload: MovingOrderPayload;
  /** מובילים שעומדים בכל התנאים */
  matchedDriverIds: string[];
  /** אזור בלבד — לא עומדים בשאר */
  optionalDriverIds: string[];
  /** נוספו ידנית מהממשק */
  manualDriverIds: string[];
  /** מזהי מובילים שהמשתמש ביטל מהבחירה (ברירת מחדל: כולם מסומנים) */
  excludedDriverIds: string[];
  /**
   * מובילים שנשלחו בפועל (שליחת התאמה / שלח ליד).
   * משמש לעמודת ההזדמנות בטבלת הזמנות — לא את כל מי שהוצע.
   */
  sentMatchDriverIds: string[];
  /** סטטוס התאמה לכל מזהה איש קשר (מוביל) */
  driverMatchFlags?: Record<string, DriverMatchFlag>;
  /** סיבות קצרות (עברית) לכל מוביל — למה כתום/אדום */
  driverMatchIssues?: Record<string, string[]>;
  /** סיבת דחייה (שליחה ל-webhook ביטול התאמה) */
  matchRejectionReason?: string;
  dispatchedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type DriverSummary = {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
};

/** פירוט מוביל לטאב התאמה — נטען מה-API */
export type MoverMatchEnrichment = {
  opportunityId?: string;
  /** שם ההזדמנות בפייפליין לקוחות (לתצוגה וקישורים) */
  opportunityName?: string;
  /** הערת הזדמנות רלוונטית (שדה מותאם/פתק אחרון) */
  opportunityNotes?: string;
  regions: string;
  workAvailability: string;
  activityDays: string;
  apartmentMover: string;
  smallMover: string;
  sos: string;
  crane: string;
  /** סה״כ פניות (לידים) — התאמת הזמנות; נשמר לתאימות / שימוש חיצוני */
  leadCount: string;
  /** לידים שנשלחו בחבילה הנוכחית (שדה opportunity) */
  packageCurrentSentLeads: string;
  /** לידים שנרכשו בחבילה הנוכחית */
  packageCurrentPurchasedLeads: string;
  /** לידים שנספרו היום (יום ישראל; מתאים לשדה היומי במערכת) */
  dailyLeadsToday: string;
  /** lastLeadAt של ההזדמנות (ליד אחרון שקיבל המוביל) */
  lastLeadAt: string | null;
  flexibleHours: string;
  hourStart: string;
  hourEnd: string;
};
