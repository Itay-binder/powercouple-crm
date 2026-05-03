/** מפרט מוצר Power Couple CRM — פייפליין מכירות ושלבים */

export const PC_SALES_PIPELINE_DOC_ID = "default-sales";

/** שם התצוגה של פייפליין ברירת המחדל */
export const PC_SALES_PIPELINE_NAME = "ניהול לקוחות";

/**
 * שלבי הפייפליין (עמודות בלוח).
 * סדר קבוע — משמש גם לדשבורד וקישורים.
 */
export const PC_SALES_STAGES: readonly string[] = [
  "לקוחות ממתינים",
  "לקוחות שקנו דירה",
  "לקוחות בהקפאה",
  "לקוחות מבוטלים",
  "לקוחות משפטי",
  "פניות",
] as const;

/** שלב «זכיה» במעבר שלב — מיושר לשלב רכישת דירה */
export const PC_WON_STAGE_LABEL = "לקוחות שקנו דירה";

/** קטגוריות הערות מוצעות במסך לקוח (הרחבה הדרגתית) */
export const PC_NOTE_CATEGORIES = [
  "משימה",
  "פניה של הלקוח",
  "מימון",
  "שיחת טלפון",
  "הודעות חשובות",
  "אחר",
] as const;
