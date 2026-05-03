/**
 * ערים נפוצות בישראל (עברית) — לחילוץ והתאמה מכתובות.
 * ממוין לפי אורך יורד בפונקציית החילוץ.
 */
export const ISRAEL_CITIES_HE: string[] = [
  "קרית שמונה",
  "מעלה אדומים",
  "אריאל",
  "ראש פינה",
  "קרית אתא",
  "קרית ביאליק",
  "קרית מוצקין",
  "קרית ים",
  "נוף הגליל",
  "באר שבע",
  "אילת",
  "דימונה",
  "נתיבות",
  "שדרות",
  "אופקים",
  "ירוחם",
  "מצפה רמון",
  "פתח תקווה",
  "ראשון לציון",
  "רמת השרון",
  "רמת מגשימים",
  "הוד השרון",
  "כפר סבא",
  "הרצליה",
  "רעננה",
  "כפר יונה",
  "טירה",
  "קלנסווה",
  "טייבה",
  "אום אל-פחם",
  "נצרת",
  "נצרת עילית",
  "עפולה",
  "בית שאן",
  "טבריה",
  "צפת",
  "כרמיאל",
  "מגדל העמק",
  "יקנעם עילית",
  "זכרון יעקב",
  "בנימינה",
  "חדרה",
  "אור עקיבא",
  "קיסריה",
  "זרזיר",
  "באקה אל-גרביה",
  "חיפה",
  "נשר",
  "טירת כרמל",
  "עכו",
  "נהריה",
  "קרית טבעון",
  "יוקנעם",
  "רמות מנשה",
  "תל אביב-יפו",
  "תל אביב",
  "רמת גן",
  "גבעתיים",
  "בני ברק",
  "בת ים",
  "חולון",
  "אזור",
  "ראשון לציון",
  "נס ציונה",
  "רחובות",
  "יבנה",
  "אשדוד",
  "אשקלון",
  "קרית גת",
  "קרית מלאכי",
  "גדרה",
  "גן יבנה",
  "מודיעין",
  "מודיעין-מכבים-רעות",
  "שוהם",
  "לוד",
  "רמלה",
  "רמלה לוד",
  "ירושלים",
  "בית שמש",
  "מבשרת ציון",
  "גבעת זאב",
];

function normHe(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u0591-\u05C7]/g, "")
    .toLowerCase();
}

const SORTED_CITIES = [...new Set(ISRAEL_CITIES_HE)].sort((a, b) => b.length - a.length);

/**
 * מחלץ מועמדים לערים ממחרוזות כתובת (למשל "רחוב, עיר").
 */
export function extractCityHints(pickup: string, dropoff: string): string[] {
  const full = `${pickup || ""} ${dropoff || ""}`.trim();
  if (!full) return [];
  const out = new Set<string>();
  const nFull = normHe(full);

  for (const city of SORTED_CITIES) {
    const nc = normHe(city);
    if (nc.length >= 2 && nFull.includes(nc)) {
      out.add(city.trim());
    }
  }

  for (const part of [pickup, dropoff]) {
    if (!part?.trim()) continue;
    const segments = part.split(",").map((x) => x.trim()).filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && last.length >= 2) out.add(last);
  }

  return Array.from(out);
}
