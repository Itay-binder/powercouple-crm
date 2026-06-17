import type { MoverPhoto, MoverReview, PublicMoverData } from "./types";

/** 79+23+4+1 = 107 → 503/107 ≈ 4.70 */
const MOCK_BREAKDOWN: Record<number, number> = {
  5: 79,
  4: 23,
  3: 4,
  2: 1,
  1: 0,
};

const REVIEW_TEXTS: string[] = [
  "הגיעו בדיוק בזמן, ארזו הכל בזהירות והובילו בלי שריטה. מקצועיים ברמה אחרת.",
  "הובלה של דירה שלמה בתל אביב — צוות סבלני, מחיר הוגן ושירות חם. ממליץ בחום.",
  "משרד שלם עם ציוד עדין — הכל הגיע שלם. תודה על הסבל והיעילות.",
  "הובלה קטנה בין שני רבעים — מהירים, נקיים, בלי הפתעות במחיר.",
  "פירוק והרכבה של מטבח וארונות — עבודה מסודרת ומדויקת. נשארתי מרוצה מאוד.",
  "קיבלתי הצעה שקופה, ליווי טלפוני טוב והצוות חייכני גם בסוף יום ארוך.",
  "הובלת משרד עם עשרות עמדות — תיאום מול הבניין והכל עבר חלק.",
  "דירת סטודנטים עם הרבה קרטונים — לא ויתרו על איכות האריזה.",
  "שירות חירום לילה — הגיעו תוך שעתיים. הצילו אותנו לפני טיסה.",
  "ניסיון שני איתם כי הפעם הראשונה הייתה מצוינת. עקביות זה המפתח.",
  "מעלית תקועה בבניין ישן — גלשו הכל בגרם המדרגות בלי תלונות.",
  "שכרנו גם אריזה מלאה — חסכו לנו יומיים של עבודה.",
  "פיצוע קטן על רהיט — טיפלו בזה מיד עם פיצוי והבנה. אחריות אמיתית.",
  "מפנים חנות קטנה — כל הקופסאות ממוספרות, קל לארגן אחרי.",
  "מומלץ לחברים כבר שלוש פעמים. כל פעם אותה רמה.",
  "תיאום וואטסאפ מהיר, הגיעו עם כל הציוד הנדרש ושומרי מפרץ לרצפה.",
  "הובלה מהשפלה לצפון — מחיר תחרותי ושקיפות מלאה.",
  "טיפלו ברגישות במזגנים ובמקרר — ממש כמו שביקשנו.",
  "צוות קומפקטי שמבין בפריקה והרכבה של ריהוט מורכב.",
  "סיכום: שירות פרימיום במחיר סביר. נחזור שוב בלי להסס.",
];

function demoDate(i: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - (i + 3) * 4);
  return d;
}

/**
 * נתוני דמה ל«כרטיס המוביל של ליפטיגו» — קריאייטיב והשקה (20 ביקורות מוצגות, 4.7 מ־107 המלצות).
 */
export function getLiftygoCardShowcaseData(): PublicMoverData {
  const now = new Date();
  const reviews: MoverReview[] = REVIEW_TEXTS.slice(0, 20).map((text, i) => ({
    id: `showcase-review-${i + 1}`,
    reviewerName: ["יעל כ.", "דוד מ.", "נועה ר.", "איתי ש.", "מיכל ב.", "רועי א.", "שרה ל.", "תומר ק.", "הילה ז.", "גיא פ.", "עדי נ.", "אורן ט.", "מאיה ד.", "קובי י.", "שני ו.", "עומר ח.", "ליאור ס.", "ניב ג.", "טל א.", "רון ה."][i] ?? `לקוח ${i + 1}`,
    rating: i % 7 === 3 ? 4 : 5,
    text,
    isHidden: false,
    createdAt: demoDate(i),
    reviewerPhoto: undefined,
  }));

  const photos: MoverPhoto[] = Array.from({ length: 6 }, (_, i) => ({
    id: `showcase-photo-${i + 1}`,
    url: `https://picsum.photos/seed/liftygo-card-${i}/600/600`,
    caption: undefined,
    uploadedBy: "customer" as const,
    isHidden: false,
    createdAt: now,
  }));

  return {
    id: "showcase-liftygo-card",
    slug: "liftygo-card",
    name: "כרטיס המוביל · ליפטיגו",
    phone: "+972501234567",
    bio: "עושה את כל סוגי ההובלה — דירות, קטנות, משרדים ופירוק והרכבה. זה כרטיס דמה לקריאייטיב והשקה של «כרטיס המוביל של ליפטיגו».",
    services: ["apartment", "small", "office", "loading"],
    profileImageUrl:
      "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=200&h=200&fit=crop&q=80",
    coverArea: "כל הארץ · זמינות מהירה",
    displayTheme: "light",
    isActive: true,
    createdAt: now,
    updatedAt: now,
    rating: 4.7,
    reviewCount: 107,
    ratingBreakdown: { ...MOCK_BREAKDOWN },
    reviews,
    photos,
  };
}
