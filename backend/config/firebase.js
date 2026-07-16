const admin = require('firebase-admin');

// يدعم طريقتين: متغيرات بيئة منفصلة، أو ملف serviceAccountKey.json مباشر
let credential;

if (process.env.FIREBASE_PRIVATE_KEY) {
  credential = admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  });
} else {
  // بديل: ضع ملف serviceAccountKey.json في مجلد backend/config
  credential = admin.credential.cert(require('./serviceAccountKey.json'));
}

admin.initializeApp({
  credential,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.firestore();
const rtdb = admin.database(); // نستخدم Realtime Database لمواقع اللحظة الحالية (أسرع وأرخص من Firestore للتحديث كل 5-10 ثوانٍ)
const auth = admin.auth();

module.exports = { admin, db, rtdb, auth };
