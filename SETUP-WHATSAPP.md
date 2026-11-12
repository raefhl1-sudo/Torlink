# חיבור וואטסאפ (Meta) ל-TorLink

כל עוד וואטסאפ לא מחובר, המערכת עובדת במצב בדיקה. התורים נשמרים וההודעות נרשמות בלשונית "וואטסאפ" בניהול, אבל הן לא יוצאות ללקוחות. אחרי החיבור הן נשלחות לבד:

| מתי | תבנית |
|---|---|
| הלקוח קובע תור | `torlink_confirm` |
| יום לפני התור, משעה 18:00 | `torlink_reminder` |
| הלקוח או העסק משנים תור | `torlink_changed` |
| התור מבוטל | `torlink_cancelled` |

## 1. חשבון ומספר
1. היכנס ל-business.facebook.com ופתח Meta Business Account אם עוד אין לך. מומלץ לעשות אימות עסק (Business Verification), כי בלעדיו יש מגבלה על מספר ההודעות ביום.
2. ב-developers.facebook.com: Create App → סוג **Business** → הוסף את המוצר **WhatsApp**.
3. הוסף מספר טלפון לעסק. המספר **לא** יכול להיות מחובר כרגע לאפליקציית וואטסאפ רגילה, אז עדיף מספר חדש או מספר קווי. מאמתים אותו ב-SMS או בשיחה.
4. ב-WhatsApp Manager מוסיפים אמצעי תשלום. Meta גובה תשלום על כל הודעה.

## 2. טוקן קבוע ו-Phone number ID
1. ב-Business Settings → **System users** → צור משתמש מערכת (Admin).
2. שייך אליו את האפליקציה ואת חשבון הוואטסאפ, וצור **Token** עם ההרשאות `whatsapp_business_messaging` ו-`whatsapp_business_management`. בחר שהטוקן לא יפוג אף פעם.
3. במסך WhatsApp → API Setup של האפליקציה, העתק את **Phone number ID** (מספר ארוך, לא מספר הטלפון).

## 3. ארבע תבניות הודעה
ב-WhatsApp Manager → Message templates → Create. **קטגוריה: Utility**. לכל תבנית יוצרים שתי שפות עם **אותו שם**: Hebrew (`he`) ו-Arabic (`ar`).

המשתנים זהים בכל התבניות:
`{{1}}` שם הלקוח · `{{2}}` שם העסק · `{{3}}` השירות · `{{4}}` התאריך · `{{5}}` השעה · `{{6}}` הקישור

דוגמאות שאפשר לתת ל-Meta בזמן ההגשה: יוסף · ברבר סטודיו · תספורת גבר · יום חמישי 5/11 · 10:00 · https://torlink.netlify.app/m/abc123

### torlink_confirm
**עברית**
```
שלום {{1}}, התור שלך ב{{2}} נקבע ✅
{{3}} · {{4}} בשעה {{5}}
לשינוי או ביטול התור: {{6}}
תודה!
```
**ערבית**
```
مرحبا {{1}}، تم حجز موعدك في {{2}} ✅
{{3}} · {{4}} الساعة {{5}}
لتغيير أو إلغاء الموعد: {{6}}
شكرًا!
```

### torlink_reminder
**עברית**
```
שלום {{1}} 👋 תזכורת: מחר, {{4}} בשעה {{5}}, יש לך תור ב{{2}} ({{3}}).
לשינוי או ביטול: {{6}}
נתראה!
```
**ערבית**
```
مرحبا {{1}} 👋 تذكير: غدًا، {{4}} الساعة {{5}}، لديك موعد في {{2}} ({{3}}).
للتغيير أو الإلغاء: {{6}}
نراك قريبًا!
```

### torlink_changed
**עברית**
```
שלום {{1}}, התור שלך ב{{2}} עודכן ✅
{{3}} · {{4}} בשעה {{5}}
לשינוי נוסף: {{6}}
תודה!
```
**ערבית**
```
مرحبا {{1}}، تم تعديل موعدك في {{2}} ✅
{{3}} · {{4}} الساعة {{5}}
لتغيير آخر: {{6}}
شكرًا!
```

### torlink_cancelled
**עברית**
```
שלום {{1}}, התור שלך ב{{2}} ({{3}}) ב{{4}} בשעה {{5}} בוטל.
לקביעת תור חדש: {{6}}
תודה!
```
**ערבית**
```
مرحبا {{1}}، تم إلغاء موعدك في {{2}} ({{3}}) يوم {{4}} الساعة {{5}}.
لحجز موعد جديد: {{6}}
شكرًا!
```

האישור של Meta לוקח בדרך כלל בין כמה דקות לכמה שעות. אם תבנית נדחתה, אפשר לשנות קצת את הניסוח, **בתנאי שהמשתנים נשארים {{1}} עד {{6}} באותה משמעות**.

## 4. הזנה ב-Netlify
ב-app.netlify.com → פרויקט **torlink** → Project configuration → **Environment variables** מוסיפים:

| שם | ערך |
|---|---|
| `WA_TOKEN` | הטוקן הקבוע משלב 2 |
| `WA_PHONE_ID` | ה-Phone number ID משלב 2 |

אחר כך: Deploys → **Trigger deploy**. בלי deploy חדש המשתנים לא נכנסים לתוקף.

## 5. בדיקה
נכנסים ל-`https://torlink.netlify.app/admin/demo` → לשונית **וואטסאפ**. צריכה להופיע ההודעה "וואטסאפ מחובר ✅". שולחים הודעת בדיקה למספר שלך, ואם משהו לא תקין, השגיאה של Meta מופיעה מתחת להודעה.

## הגדרות נוספות (לא חובה)
| שם | מה זה |
|---|---|
| `REMINDER_HOUR` | השעה שממנה נשלחות התזכורות של מחר (ברירת מחדל 18) |
| `WA_TPL_CONFIRM` / `WA_TPL_REMINDER` / `WA_TPL_CHANGED` / `WA_TPL_CANCELLED` | אם נתת לתבניות שמות אחרים |
| `WA_API_VERSION` | גרסת ה-Graph API (ברירת מחדל v23.0) |

## 6. הבוט – לקוחות קובעים תור בצ'אט
הבוט עונה ללקוחות שכותבים למספר הוואטסאפ של המערכת. הוא קובע, מציג, מזיז ומבטל תורים, ובודק תמיד את התורים הפנויים באמת. הודעות של הבוט בתוך שיחה שהלקוח פתח לא דורשות תבניות.

**א. Webhook ב-Meta**
ב-developers.facebook.com → האפליקציה → WhatsApp → **Configuration** → Webhook → Edit:
- Callback URL: `https://torlink.app/wa/webhook`
- Verify token: כל מילה סודית שתבחר, למשל `torlink-2026-xyz`
- אחרי Verify and save → **Manage** → לסמן **messages** → Subscribe

**ב. משתנים ב-Netlify** (ואז Trigger deploy)
| שם | ערך |
|---|---|
| `WA_VERIFY_TOKEN` | אותה מילה סודית מסעיף א׳. **להזין לפני** ה-Verify ב-Meta |
| `WA_APP_SECRET` | App settings → Basic → App secret (מגן שרק Meta יכולה לשלוח לבוט) |
| `WA_DISPLAY_NUMBER` | מספר הוואטסאפ של המערכת בפורמט בינלאומי, למשל `972501234567`. מפעיל את הכפתור "קביעת תור בוואטסאפ" בדף העסק |
| `ANTHROPIC_API_KEY` | לא חובה. מפעיל הבנה של טקסט חופשי ("بدي دور بكرا المسا"). מ-console.anthropic.com |
| `WA_DEFAULT_SLUG` | לא חובה. אם כל המספר שייך לעסק אחד בלבד |

**ג. איך הבוט יודע לאיזה עסק הלקוח כותב?**
1. הקישור מהדף של העסק (ומהלשונית "בוט" בניהול) כבר כולל את קוד העסק, למשל `#ayah`.
2. אחרי פעם אחת הוא זוכר את הלקוח.
3. לעסק עם מספר וואטסאפ משלו: `POST /api/super/wa-link` עם `{slug, phoneId}` וכותרת `x-super-key`.

**ד. בדיקה בלי Meta:** בניהול → לשונית **בוט** יש סימולטור. מדברים עם הבוט כמו לקוח.

## 7. התראות לבעל העסק (2 תבניות נוספות)
מגישים ב-Meta עוד שתי תבניות **Utility**, בעברית (`he`) ובערבית (`ar`):

**`torlink_owner`** (תור חדש / הוזז / בוטל)
```
🔔 {{1}}
{{2}} · {{3}}
{{4}} בשעה {{5}}
טלפון: {{6}}
```
```
🔔 {{1}}
{{2}} · {{3}}
{{4}} الساعة {{5}}
هاتف: {{6}}
```
**`torlink_daily`** (סיכום של מחר, נשלח בערב)
```
📋 מחר, {{1}}, יש ב{{2}} {{3}} תורים:
{{4}}
ליומן: {{5}}
```
```
📋 بكرا، {{1}}، في {{2}} عندك {{3}} مواعيد:
{{4}}
لليومية: {{5}}
```
בעל העסק מגדיר את המספר שלו בניהול ← הגדרות ← **התראות**.

## 8. ניהול הפלטפורמה (בשבילך)
| שם | ערך |
|---|---|
| `SUPER_KEY` | הקוד שלך לכניסה ל-`/super`: כל העסקים, הפעלה אחרי תשלום, השהיה, מחירים |
| `PLATFORM_PHONE` | הוואטסאפ שלך. מקבל הודעה על כל עסק חדש שנרשם (בתבנית `torlink_owner`) |
| `OWNER_DAILY_HOUR` | שעת הסיכום היומי לבעלי העסקים (ברירת מחדל 20) |

- דף המכירה: `https://torlink.netlify.app/`. עסק שנרשם מקבל סטטוס **ממתין לתשלום**. הוא יכול להיכנס ולהגדיר הכול, אבל לקוחות לא יכולים לקבוע תור עד שתפעיל אותו.
- ב-`/super` לוחצים **+ חודש** או **+ שנה** אחרי שהתשלום התקבל. 3 ימים אחרי שהתוקף נגמר, קביעת התורים נעצרת לבד.
- המחירים, היתרונות של כל חבילה והוראות התשלום נערכים ב-`/super` ← **מחירים והגדרות**.

## 9. Google Wallet (client card in the wallet)

1. pay.google.com/business/console → register as a business → Google Wallet API → copy the **Issuer ID**.
2. console.cloud.google.com → new project → enable **Google Wallet API**.
3. IAM → Service Accounts → create one → Keys → Add key → JSON (keep it private, never paste it in chats).
4. Back in the Wallet console → Users → invite the service-account email as **Developer**.
5. Netlify → Environment variables:
   - `GW_ISSUER_ID` = the issuer number
   - `GW_KEY` = the whole JSON file contents
6. Redeploy. The "Add to Google Wallet" button appears on every client card (not on iPhone).
   Balance updates automatically after each sale / redeem.
7. Demo mode: only console users / test accounts can save passes. Request **publishing access** in the console to open it to all clients.
