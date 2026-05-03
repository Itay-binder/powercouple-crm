# Power Couple CRM

מערכת לניהול **קליטת לקוחות** ותהליכי מכירות — מבוססת על אותו ליבה כמו [Itay-binder/CRM](https://github.com/Itay-binder/CRM) (Next.js, Firebase Auth, Firestore, אינטגרציות Google ועוד).

## מה כלול (בדומה ל-CRM המקורי)

- התחברות עם Google (Firebase Auth)
- הרשאות דרך Firestore: `invites` ו-`users`
- דשבורד, אנשי קשר, פייפליין, משימות, לוח שנה ופיצ׳רים נוספים לפי ההגדרות במסד

## התחלה מהירה

1. העתק `.env.example` ל-`.env`.
2. מלא את ערכי **פרויקט Firebase חדש** ו-**Google Cloud / Sheets** (פרטים ב-`DEPLOYMENT.md`).
3. `npm install` ואז `npm run dev`.

## פריסה

הוראות מלאות ל-Vercel, Firebase נפרד ו-Google Cloud: **`DEPLOYMENT.md`**.
