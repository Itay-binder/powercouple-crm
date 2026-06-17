# liftygo CRM (MVP)

Liftygo CRM הוא CRM לניהול לידים ואנשי קשר עבור צוותי מכירות.
הפרויקט בנוי על Next.js, משתמש באימות Google (Firebase Auth) עם הרשאות דרך Firestore (`invites` / `users`),
ומשתמש ב-Google Sheets כמקור הנתונים של הלידים (ובשלב הבא גם כתיבה/אוטומציות).

## מה כלול ב-MVP (שלד)
- התחברות עם Google (Firebase Auth)
- הרשאות גישה דרך Firestore: `invites` + `users`
- מסך `Pending` למשתמש שממתין לאישור
- Dashboard בסיסי עם מדדים לפי סטטוס + פילטר תאריכים (שליפה מה-Sheets)
- Contacts בסיסי (טבלה לקריאה מה-Sheets)
- Pipeline בסיסי לפי עמודת סטטוס בשיטס (קריאה בלבד בינתיים)
- מסך `שדות מותאמים` (שלד ל-UI, מימוש בהמשך)

## הגדרות
יש להעתיק את `.env.example` ל-`.env` ולהגדיר ערכים מתאימים.

