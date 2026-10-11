# FINPILOT AI — Setup Guide (मराठी)

## Bro, ZIP मधून Vercel वर App live करण्याचे steps 🚀

**हा coded Next.js web app आहे.** Android browser वर चालेल, पण फोनमधील UPI SMS वाचू शकत नाही. Photo/PDF बिल transactions ला जोडता येते. Database आणि files Supabase मध्ये private ठेवले जातात.

### 1) Supabase Setup

1. [supabase.com](https://supabase.com/dashboard) वर नवीन Project तयार कर.
2. Project उघडून **SQL Editor** मध्ये `supabase/schema.sql` फाइलचा पूर्ण मजकूर paste करून **Run** कर. याने DB tables, RLS security आणि private `receipts` bucket तयार होईल.
3. Supabase project **URL** आणि **Publishable/Anon Key** घे.
4. **Authentication → Providers → Email** enabled ठेव. Production साठी email confirmation + SMTP व्यवस्थित configure कर.

### 2) Vercel Deploy

1. हा ZIP extract कर आणि source GitHub **private repository** मध्ये upload कर.
2. [vercel.com/new](https://vercel.com/new) वर GitHub repository Import कर.
3. Environment Variables मध्ये हे टाक:

```
NEXT_PUBLIC_SUPABASE_URL = https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = sb_publishable_...
```

4. **Deploy** दाब.
5. Vercel कडून मिळालेला URL Supabase → Authentication → URL Configuration मध्ये Site URL म्हणून configure कर.
6. App उघडून Signup/Login कर; Accounts मध्ये Bank/Cash account तयार कर; Transaction मध्ये receipt photo/PDF attach करून तपास.

### 3) Local PC वर चालवायचा असल्यास

```
npm install
npm run dev
```

Browser उघड: `http://localhost:3000`

आधी `.env.example` ची copy `.env.local` मध्ये कर व credentials भर. Credentials नसताना demo sample पाहता येतो (local storage, permanent cloud data नाही).

### 4) Live करण्यापूर्वी

App चे user auth, attachments, RLS, transaction calculations, account deletion, backup व security यांची actual Supabase project वर चाचणी कर. हा functional MVP आहे, audited fintech production release नाही. SMS automation / Android APK / real bank connection यासाठी पुढील development लागेल.

**कधीही `service_role` secret key Vercel मधील `NEXT_PUBLIC_...` variable मध्ये टाकू नकोस.**


## Final V1.1 Checklist (एकदाच deploy करण्याआधी)

1. Supabase मध्ये **नवीन** project असेल तर `supabase/schema.sql` SQL Editor मध्ये run कर. जुना V1 database असेल तर `supabase/upgrade_v1_to_v1_1.sql` run कर. दोन्ही एकाच वेळी run करू नकोस.
2. `NEXT_PUBLIC_SUPABASE_URL` आणि `NEXT_PUBLIC_SUPABASE_ANON_KEY` हे Vercel Environment Variables मध्ये सेट कर. `service_role` किंवा secret key browser मध्ये टाकू नकोस.
3. Supabase Authentication URL Configuration मध्ये Vercel चा domain Site URL आणि Redirect URLs मध्ये दे. Email confirmations/password recovery साठी SMTP configure कर.
4. GitHub private repository मध्ये **ZIP मधील सर्व फाईल्स repository root मध्ये** ठेव, मग Vercel Import Git Repository -> Deploy.
5. Deploy नंतर login/signup, account add, expense entry, photo+PDF receipt upload/view/delete, ledger, EMI, recurring rules, CSV import आणि report export चाचणी कर.
6. production users साठी privacy policy, terms, support email, backup आणि app security testing पूर्ण कर.

वेबसाइट SMS किंवा UPI notifications थेट वाचू शकत नाही. Automatic bank sync आणि guaranteed background notifications या web build मध्ये नाहीत; पुढे वेगळा Android implementation/authorised integration हवा.
