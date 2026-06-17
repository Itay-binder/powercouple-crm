"use client";

/**
 * מסך «ניהול» סטטי לכרטיס ההדגמה liftygo-card — לקריאייטיב בלבד.
 */
export default function CreativeShowcaseManagePreview() {
  const field = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(139,92,246,0.25)",
    borderRadius: 12,
    padding: "12px 14px",
    color: "#e5e7eb",
    fontSize: 14,
  };

  return (
    <div
      style={{
        fontFamily: "var(--font-rubik), Rubik, sans-serif",
        direction: "rtl",
        color: "#f9fafb",
        padding: "16px 16px 32px",
        maxWidth: 560,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, rgba(124,58,237,0.25), rgba(109,40,217,0.15))",
          border: "1px solid rgba(167,139,250,0.35)",
          borderRadius: 16,
          padding: "16px 18px",
          marginBottom: 20,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>תצוגת ניהול לדוגמה</div>
        <div style={{ fontSize: 13, color: "#c4b5fd", lineHeight: 1.55 }}>
          במוביל אמיתי כאן יופיעו עריכת פרטים, המלצות, תמונות ותצוגת כרטיס — זה מוק ל«כרטיס המוביל של ליפטיגו»
          לצורך צילומים והשקה.
        </div>
      </div>

      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, color: "#a78bfa" }}>פרופיל (דמה)</div>
      <div style={{ display: "grid", gap: 10, marginBottom: 22 }}>
        <div style={field}>שם המוצג · כרטיס המוביל · ליפטיגו</div>
        <div style={field}>טלפון · +972-50-***-**67</div>
        <div style={{ ...field, minHeight: 72 }}>
          תיאור קצר · עושה את כל סוגי ההובלה — דירות, קטנות, משרדים ופירוק והרכבה…
        </div>
      </div>

      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, color: "#a78bfa" }}>שירותים (דמה)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
        {["הובלת דירה", "הובלות קטנות", "משרדים", "פירוק והרכבה"].map((t) => (
          <span
            key={t}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              background: "rgba(124,58,237,0.25)",
              border: "1px solid rgba(167,139,250,0.4)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {t}
          </span>
        ))}
      </div>

      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, color: "#a78bfa" }}>המלצות ותמונות (דמה)</div>
      <div style={{ ...field, opacity: 0.85, fontSize: 13 }}>
        ניהול הסתרת ביקורות · מחיקה · סינון תמונות — יופיע כאן במוביל חי מחובר לחשבון.
      </div>
    </div>
  );
}
