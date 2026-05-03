# פריסת Power Couple CRM (Vercel + Firebase + Google)

מדריך זה מניח שאתם בונים **סביבה נפרדת** מ-Liftygo: פרויקט Firebase משלכם, פרויקט Vercel משלכם, ואופציונלית פרויקט Google Cloud ייעודי (או אותו ארגון עם APIs מופעלים).

---

## 1. Firebase (פרויקט חדש)

1. ב-[Firebase Console](https://console.firebase.google.com/) צרו **Add project** (שם לפי בחירתכם, למשל `powercouple-crm`).
2. **Authentication** → Sign-in method → הפעילו **Google** והגדירו תמיכת OAuth (מסך הסכמה, דומיין מורשה אם צריך).
3. **Firestore Database** → צרו מסד (למשל `(default)` או שם מותאם אם אתם משתמשים ב־multi-database — ראו `CRM_TENANTS` ב-`.env.example`).
4. אם נדרש **Storage** (מסמכים בפתקים וכו׳) — הפעילו מהקונסול.
5. **Project settings** (גלגל שיניים) → **Your apps** → הוסיפו אפליקציית **Web** וקבלו את ערכי ה־SDK ל־**משתני `NEXT_PUBLIC_FIREBASE_*`**.
6. **Project settings** → **Service accounts** → **Generate new private key** — זה ה־JSON ל־**`FIREBASE_SERVICE_ACCOUNT_JSON`** (מחרוזת JSON אחת בשורה אחת ב-Vercel, או קובץ מקומי ב־`.env`).

**חשוב:** אל תשתפו את אותו פרויקט Firebase עם Liftygo אם אתם רוצים נתונים והרשאות נפרדים.

---

## 2. Google Cloud (Sheets, Calendar, וכו׳)

ברוב המקרים Firebase יושב על אותו פרויקט Google Cloud (אפשר לפתוח מ-Firebase: Project settings → Integrations → Google Cloud).

1. ב-[Google Cloud Console](https://console.cloud.google.com/) בחרו את **אותו פרויקט** (או פרויקט נפרד אם בחרתם כך).
2. **APIs & Services** → **Enable APIs** — הפעילו לפחות:
   - **Google Sheets API** (אם אתם משתמשים בגיליונות)
   - **Google Calendar API** (אם משתמשים בסנכרון לוח)
3. **IAM & Admin** → **Service Accounts** → צרו Service Account ל־CRM או השתמשו בקיים.
4. הורידו מפתח JSON — זה יכול להיות **`GOOGLE_SERVICE_ACCOUNT_JSON`** (בפורמט מחרוזת JSON כמו ב־`.env.example`).
5. **שיתוף הגיליון:** פתחו את ה-Google Sheet → Share → הוסיפו את **כתובת המייל של ה-Service Account** (שדה `client_email` ב-JSON) עם הרשאת Viewer/Editor לפי הצורך.
6. העתיקו את **`GOOGLE_SPREADSHEET_ID`** מכתובת הדפדפן של הגיליון.

אם אתם משתמשים ב־**OAuth** (לוח שנה, Meta וכו׳), עדכנו Redirect URIs לכתובת ה-production החדשה של Vercel (ראו סעיף 4).

---

## 3. משתני סביבה מקומית

1. העתיקו `.env.example` ל-`.env`.
2. מלאו:
   - כל ה־`NEXT_PUBLIC_FIREBASE_*`
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SPREADSHEET_ID` (אם רלוונטי)
   - `ADMIN_EMAILS` — מיילים של מנהלים
   - `CRM_INGEST_API_KEY` — מפתח לאוטומציות (Make וכו׳)
3. אם יש **ריבוי טננטים** (`CRM_TENANTS`), ודאו שמזהי ה־`id` / `databaseId` תואמים למה שיצרתם ב-Firestore. ברירת המחדל בקוד ל«ניהול הזמנות» מצפה לטננט בשם `powercouple-customers` אלא אם הגדרתם `CRM_MOVING_ORDERS_TENANT_IDS`.

הריצו `npm run dev` ובדקו התחברות.

---

## 4. Vercel (פרויקט חדש)

1. ב-[Vercel](https://vercel.com/) → **Add New** → **Project** → ייבאו את הריפו  
   [https://github.com/Itay-binder/powercouple-crm](https://github.com/Itay-binder/powercouple-crm)  
   (אחרי שדחפתם אליו קוד — ראו סעיף 6).
2. Framework: **Next.js** (ברירת מחדל). Node ≥ 20 (כמו ב-`package.json`).
3. ב-**Settings → Environment Variables** הוסיפו **את כל המפתחות** מ-`.env` (בפרט JSON ארוכים — הדביקו כערך אחד לכל משתנה).
4. **Deploy**. קבלו URL כמו `https://<project>.vercel.app`.
5. חזרו ל-**Firebase Auth** → **Authorized domains** והוסיפו את דומיין ה-Vercel (ואת דומיין מותאם אם חיברתם).
6. עדכנו ב-Google Cloud את **OAuth consent** ו-**redirect URIs** לכתובת ה-production החדשה (למשל `https://xxx.vercel.app/api/google-calendar/callback` אם בשימוש).

משתנה שימושי: `NEXT_PUBLIC_APP_URL=https://<your-vercel-domain>` לקישורי callback עקביים.

---

## 5. סודות ב-GitHub Actions (אופציונלי)

אם אתם משתמשים ב-workflow של cron (למשל `task-webhooks-cron.yml`):

- הגדירו ב-GitHub Repo → **Secrets**:
  - `CRM_SITE_URL` — כתובת ה-production בלי `/` בסוף
  - `CRON_SECRET` — אותו ערך כמו `CRON_SECRET` ב-Vercel (אם מוגדר שם)

---

## 6. דחיפה ל-GitHub (הריפו שלכם)

במחשב המקומי (פעם ראשונה):

```bash
cd powercouple-crm
git init
git add .
git commit -m "Initial Power Couple CRM from CRM base"
git branch -M main
git remote add origin https://github.com/Itay-binder/powercouple-crm.git
git push -u origin main
```

אם הריפו לא ריק ב-GitHub, ייתכן שתצטרכו `git pull --rebase origin main` לפני ה-push.

---

## סיכום צ׳ק-ליסט

| שלב | פעולה |
|-----|--------|
| Firebase | פרויקט חדש, Auth + Firestore (+ Storage אם צריך) |
| מפתחות | Web SDK → `NEXT_PUBLIC_*`, Service Account → `FIREBASE_SERVICE_ACCOUNT_JSON` |
| Google | Sheets API, שיתוף גיליון עם ה-Service Account |
| Vercel | פרויקט חדש, כל משתני הסביבה, דומיין ב-Firebase Authorized domains |
| שינויים עתידיים | עדכון פייפליין/שדות — בדרך כלל ב-Firestore ובממשק ה-CRM בלבד |

אם משהו נכשל בבילד ב-Vercel, בדקו לוג בילד וודאו שאין מרכאות שבורות ב-JSON של משתני הסביבה.
