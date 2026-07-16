# نظام نهج للتوصيل - متابعة المناديب المباشر

## حالة المشروع: المرحلة 2 (جاهزة وقابلة للتشغيل)
✅ Backend كامل (Node.js + Firebase + Socket.io)
✅ لوحة تحكم رئيسية (خريطة مباشرة + تنبيهات صوتية/متصفح + إدارة مناديب + بحث)
✅ صفحة تقارير: إعادة تشغيل مسار الحركة (Replay) + لوحة أداء ومقارنة + تصدير Excel/PDF
✅ تطبيق Flutter كامل الهيكل (تسجيل دخول + تتبع خلفي حقيقي + طابور محلي لمنع فقدان النقاط عند انقطاع الإنترنت + دوام + 3 لغات)

### ⚠️ مهمة تشغيلية جديدة: جدولة سكربت التنظيف
سجل التحركات (لإعادة التشغيل) يُخزَّن في Realtime Database وينمو يومياً. لتفادي امتلاء
الحصة المجانية، شغّل هذا السكربت يومياً (يحذف ما هو أقدم من 30 يوماً):
```bash
node backend/scripts/cleanupOldLocations.js
```
اجدوله عبر Cron مجاني (مثال على Render.com: أنشئ "Cron Job" مجاني بنفس الأمر يومياً الساعة 3 صباحاً).

## المراحل القادمة (اطلب أياً منها متى شئت)
- شاشات إدارة المناديب الكاملة داخل لوحة التحكم (إضافة/حذف/تعديل عبر نموذج، وليس API فقط)
- خرائط حرارية (Heatmap) لمناطق النشاط
- تغليف تطبيق Flutter للنشر (أيقونة، اسم الحزمة، توقيع APK)
- نظام صلاحيات متعددة المستويات (مشرف رئيسي / مشرف فرعي)

---

## أولاً: إعداد Firebase (مجاني بالكامل لهذا العدد من المناديب)

1. اذهب إلى https://console.firebase.google.com وأنشئ مشروعاً جديداً باسم `nahj-delivery`.
2. من القائمة الجانبية: **Build > Realtime Database** → أنشئ قاعدة بيانات (اختر أقرب سيرفر).
3. من القائمة الجانبية: **Build > Firestore Database** → أنشئ قاعدة بيانات (Production mode).
4. من ⚙️ **Project Settings > Service Accounts** → اضغط **Generate New Private Key** → سيُنزَّل ملف JSON.
   - ضع هذا الملف في `backend/config/serviceAccountKey.json`
   - أو انسخ القيم منه إلى ملف `.env` (الطريقة الأفضل للنشر على استضافة سحابية).
5. **مهم بخصوص التكلفة**: خطة Firebase المجانية (Spark) تكفي بسهولة لـ 80 مندوباً بتحديث كل 8 ثوانٍ
   طالما استخدمت **Realtime Database** للمواقع اللحظية (كما فعلنا في الكود) وليس Firestore،
   لأن Firestore يتقاضى رسوماً لكل عملية قراءة/كتابة بينما Realtime DB يحتسب حجم البيانات المنقولة فقط،
   وحجم بيانات الموقع صغير جداً. راقب استهلاكك من Firebase Console بعد الإطلاق للتأكد.

## ثانياً: تشغيل الخادم (Backend)

```bash
cd backend
npm install
cp .env.example .env
# افتح .env وعدّل القيم (خصوصاً بيانات Firebase ومفتاح JWT_SECRET)
node scripts/createFirstAdmin.js   # ينشئ أول حساب مشرف (admin / ChangeMe123!)
npm start
```

الخادم سيعمل على: `http://localhost:3000`
تحقق من عمله عبر: `http://localhost:3000/health`

**للنشر الفعلي (مجاني):** استضف الخادم على [Render.com](https://render.com) (الخطة المجانية Web Service)
أو [Railway.app](https://railway.app) — كلاهما يدعم Node.js مجاناً بحدود كافية لهذا الحجم من الاستخدام.

## ثالثاً: تشغيل لوحة التحكم

لوحة التحكم عبارة عن ملفات HTML/CSS/JS ثابتة، لا تحتاج بناء (build):

1. افتح `admin-dashboard/js/app.js` و `admin-dashboard/js/map.js` وعدّل `API_URL` و `SOCKET_URL`
   إلى رابط الخادم الفعلي بعد نشره (بدل localhost).
2. شغّلها محلياً بأي خادم ملفات ثابت، مثال:
   ```bash
   cd admin-dashboard
   npx serve .
   ```
3. أو انشرها مجاناً على **Firebase Hosting** أو **Netlify** أو **Vercel** (خطط مجانية كافية تماماً).
4. افتح المتصفح → `login.html` → سجّل الدخول بحساب المشرف الذي أنشأته.

## رابعاً: تشغيل تطبيق المندوب (Flutter)

```bash
cd mobile-app
flutter create . --platforms=android   # لتوليد مجلدات android/ios الفعلية إن لم تكن موجودة
flutter pub get
```

ثم:
1. افتح `android/app/src/main/AndroidManifest.xml` وأضف الأذونات الموجودة في
   `android/AndroidManifest_permissions_reference.xml` (قبل وسم `<application>`).
2. عدّل `lib/services/api_service.dart` → غيّر `baseUrl` إلى رابط الخادم الفعلي.
3. شغّل: `flutter run` (على جهاز حقيقي متصل، فالمحاكي لا يحاكي الموقع الحقيقي جيداً).
4. لبناء ملف APK جاهز للتوزيع اليدوي على المناديب (بدون نشر على Google Play):
   ```bash
   flutter build apk --release
   ```
   الملف الناتج: `build/app/outputs/flutter-apk/app-release.apk` — أرسله للمناديب مباشرة
   (تثبيت يدوي، لا حاجة لحساب مطوّر مدفوع في Google Play لهذا العدد من المستخدمين).

## ملاحظة مهمة جداً عن البطارية في الخلفية

بعض الشركات المصنّعة (شاومي، هواوي، أوبو، سامسونج) تقتل التطبيقات الخلفية رغم كل الأذونات
البرمجية الصحيحة. يجب توجيه كل مندوب لفتح إعدادات الجهاز → البطارية → نهج للتوصيل →
"السماح بالعمل في الخلفية / بدون قيود". هذه خطوة يدوية لا يمكن لأي تطبيق تجاوزها برمجياً
بسبب سياسات الخصوصية في أندرويد الحديث.

## هيكل المشروع

```
nahj-delivery/
├── backend/              # خادم API + Socket.io
│   ├── config/           # اتصال Firebase
│   ├── routes/           # auth, drivers, location, reports
│   ├── middleware/       # التحقق من التوكن والصلاحيات
│   ├── sockets/          # البث اللحظي للوحة التحكم
│   └── scripts/          # إنشاء أول حساب مشرف
├── admin-dashboard/       # لوحة تحكم HTML/JS + خريطة Leaflet/OpenStreetMap
└── mobile-app/            # تطبيق Flutter للمندوب
    └── lib/
        ├── services/      # التتبع الخلفي + الاتصال بالـ API
        ├── screens/       # تسجيل الدخول + الشاشة الرئيسية
        └── l10n/          # عربي/إنجليزي/بنغالي
```

---
**قل لي "أكمل المرحلة 2" وسأبدأ فوراً في التقارير المرئية والرسوم البيانية.**
