/** פייפליין ברירת מחדל להזמנות הובלה — ערכים קבועים ל־Firestore */
export const MOVING_ORDERS_INTAKE_PIPELINE_ID = "moving-orders-intake";

export const MOVING_ORDER_PIPELINE_NAME = "קליטת הזמנות";

export const MOVING_ORDER_STAGES = [
  "הזמנה נקלטה טרם טופלה",
  "הועברה למובילים רלוונטים",
  "הזמנה סגורה",
  "בוטל",
  "לא אושרה",
] as const;

export type MovingOrderStageLabel = (typeof MOVING_ORDER_STAGES)[number];
