// شغّل هذا السكربت مرة واحدة فقط لإنشاء أول حساب مشرف
// الأمر: node scripts/createFirstAdmin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db } = require('../config/firebase');

async function run() {
  const username = 'khaled';
  const password = 'khaled1234';

  const existing = await db.collection('admins').where('username', '==', username).limit(1).get();
  if (!existing.empty) {
    console.log('يوجد مشرف بهذا الاسم مسبقاً.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.collection('admins').add({
    username,
    passwordHash,
    name: 'المدير العام',
    createdAt: Date.now(),
  });

  console.log('✅ تم إنشاء حساب المشرف:');
  console.log('اسم المستخدم:', username);
  console.log('كلمة المرور:', password);
  console.log('⚠️ غيّر كلمة المرور فوراً بعد أول دخول.');
}

run().then(() => process.exit(0));
