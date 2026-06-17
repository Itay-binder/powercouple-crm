import type { WhatsAppTemplateButton, WhatsAppTemplateRecord } from "@/lib/whatsapp/repo";

/**
 * מגבלות תבנית WhatsApp Cloud API (כפתורי BODY / BUTTONS).
 * לפי תיעוד Meta: עד 10 כפתורים בסך הכול, מתוכם עד 2 מסוג URL (שאר — Quick Reply וכו׳).
 */
export const LIMITS = {
  bodyTextMax: 1024,
  footerMax: 60,
  headerTextMax: 60,
  buttonLabelMax: 25,
  maxButtons: 10,
  maxUrlButtons: 2,
} as const;

export type TemplateValidationIssue = { level: "error" | "warn"; message: string };

export function validateTemplateDraft(t: {
  bodyText: string;
  footerText?: string;
  category?: WhatsAppTemplateRecord["category"];
  headerFormat?: WhatsAppTemplateRecord["headerFormat"];
  headerText?: string;
  headerMediaUrl?: string;
  buttonRows?: WhatsAppTemplateButton[];
  /** כשידוע מההגדרות: false = אין App ID (חובה לכותרת מדיה בשליחה לאישור במטא). null/undefined = לא בודקים */
  metaAppIdPresent?: boolean | null;
}): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];
  const body = (t.bodyText ?? "").trim();
  if (body.length > LIMITS.bodyTextMax) {
    issues.push({
      level: "error",
      message: `גוף ההודעה ארוך מדי (${body.length}/${LIMITS.bodyTextMax} תווים).`,
    });
  } else if (body.length > LIMITS.bodyTextMax - 50) {
    issues.push({
      level: "warn",
      message: `גוף ההודעה מתקרב למגבלה (${body.length}/${LIMITS.bodyTextMax}).`,
    });
  }

  const ft = (t.footerText ?? "").trim();
  if (ft.length > LIMITS.footerMax) {
    issues.push({
      level: "error",
      message: `פוטר ארוך מדי (${ft.length}/${LIMITS.footerMax} תווים).`,
    });
  }

  if (t.category === "AUTHENTICATION") {
    issues.push({
      level: "error",
      message:
        "קטגוריית Authentication (אימות OTP) אינה נתמכת בשליחה לאישור מהמסך הזה — במטא יש לה מבנה קבוע בלי כותרת תמונה כמו בשאר התבניות. בחרו Utility או Marketing לתבנית עם תמונה, או צרו תבנית Authentication ישירות ב-Meta Business.",
    });
  }

  const hf = t.headerFormat ?? "NONE";
  if (
    (hf === "IMAGE" || hf === "VIDEO" || hf === "DOCUMENT") &&
    t.metaAppIdPresent === false
  ) {
    issues.push({
      level: "error",
      message:
        "לתבנית עם תמונה / וידאו / מסמך בכותרת חובה Meta App ID ב«חשבון WhatsApp» — בלי זה המערכת לא יכולה להעלות את הקובץ ל-Meta לצורך אישור התבנית.",
    });
  }
  if (hf === "TEXT") {
    const ht = (t.headerText ?? "").trim();
    if (!ht) {
      issues.push({ level: "error", message: "כותרת טקסט ריקה — הוסיפו טקסט או בחרו ללא כותרת." });
    } else if (ht.length > LIMITS.headerTextMax) {
      issues.push({
        level: "error",
        message: `כותרת טקסט ארוכה מדי (${ht.length}/${LIMITS.headerTextMax}).`,
      });
    }
  }
  if (hf === "IMAGE" || hf === "VIDEO" || hf === "DOCUMENT") {
    const u = (t.headerMediaUrl ?? "").trim();
    if (!u) {
      issues.push({ level: "error", message: "חסר קישור HTTPS לקובץ המדיה בכותרת." });
    } else if (!/^https:\/\//i.test(u)) {
      issues.push({ level: "warn", message: "מומלץ קישור מדיה ב־HTTPS ציבורי (ללא אימות)." });
    }
  }

  const rows = t.buttonRows ?? [];
  if (rows.length > LIMITS.maxButtons) {
    issues.push({
      level: "error",
      message: `יותר מדי כפתורים (${rows.length}/${LIMITS.maxButtons}).`,
    });
  }
  const urlCount = rows.filter((b) => b.type === "URL").length;
  if (urlCount > LIMITS.maxUrlButtons) {
    issues.push({
      level: "error",
      message: `מותר לכל היותר ${LIMITS.maxUrlButtons} כפתורי URL (קיבלת ${urlCount}).`,
    });
  }
  for (const b of rows) {
    const len = (b.text ?? "").trim().length;
    if (len > LIMITS.buttonLabelMax) {
      issues.push({
        level: "error",
        message: `טקסט כפתור "${(b.text ?? "").slice(0, 20)}…" ארוך מדי (${len}/${LIMITS.buttonLabelMax}).`,
      });
    } else if (len > LIMITS.buttonLabelMax - 3) {
      issues.push({
        level: "warn",
        message: `כפתור "${b.text}" מתקרב למגבלת ${LIMITS.buttonLabelMax} תווים.`,
      });
    }
  }

  return issues;
}
