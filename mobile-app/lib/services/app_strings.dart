import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// نظام ترجمة مبسّط جداً (بدون أدوات بناء معقدة قد تفشل عند التثبيت).
/// كل مندوب يختار لغته من شاشة الدخول أول مرة، وتُحفظ في جهازه فقط.
class AppStrings {
  // ValueNotifier يجعل الواجهة تتحدث فوراً عند تغيير اللغة، بدون إعادة تشغيل التطبيق
  static final ValueNotifier<String> languageNotifier = ValueNotifier('ar');
  static String get currentLang => languageNotifier.value;

  static Future<void> loadSavedLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    languageNotifier.value = prefs.getString('app_language') ?? 'ar';
  }

  static Future<void> setLanguage(String lang) async {
    languageNotifier.value = lang;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('app_language', lang);
  }

  static const Map<String, Map<String, String>> _values = {
    'appTitle': {'ar': 'نهج للتوصيل', 'en': 'Nahj Delivery', 'bn': 'নাহজ ডেলিভারি'},
    'driverCode': {'ar': 'رقم المندوب', 'en': 'Driver Code', 'bn': 'ড্রাইভার কোড'},
    'password': {'ar': 'كلمة المرور', 'en': 'Password', 'bn': 'পাসওয়ার্ড'},
    'login': {'ar': 'تسجيل الدخول', 'en': 'Login', 'bn': 'লগইন'},
    'chooseLanguage': {'ar': 'اختر لغتك', 'en': 'Choose your language', 'bn': 'আপনার ভাষা নির্বাচন করুন'},
    'startShift': {'ar': '✅ تسجيل الحضور', 'en': '✅ Check In', 'bn': '✅ চেক ইন'},
    'endShift': {'ar': 'إنهاء يوم العمل', 'en': 'Check Out', 'bn': 'চেক আউট'},
    'onShift': {'ar': 'أنت الآن ضمن سجل الحضور اليومي', 'en': 'You are checked in for today', 'bn': 'আপনি আজকের জন্য চেক ইন করেছেন'},
    'offShift': {'ar': 'لم تسجّل حضورك اليوم بعد', 'en': 'You have not checked in today', 'bn': 'আপনি আজ চেক ইন করেননি'},
    'requestLeave': {'ar': '🗓️ تقديم طلب إجازة', 'en': '🗓️ Request Leave', 'bn': '🗓️ ছুটির অনুরোধ'},
    'leaveReason': {'ar': 'سبب الإجازة', 'en': 'Reason', 'bn': 'কারণ'},
    'leaveReasonSick': {'ar': '🤒 مرض', 'en': '🤒 Sick', 'bn': '🤒 অসুস্থ'},
    'leaveReasonEmergency': {'ar': '🚨 ظرف طارئ / حادث', 'en': '🚨 Emergency', 'bn': '🚨 জরুরি'},
    'leaveReasonPersonal': {'ar': '👤 ظرف شخصي', 'en': '👤 Personal', 'bn': '👤 ব্যক্তিগত'},
    'leaveReasonOther': {'ar': '📝 سبب آخر', 'en': '📝 Other', 'bn': '📝 অন্যান্য'},
    'leaveDate': {'ar': 'تاريخ الإجازة المطلوبة', 'en': 'Requested date', 'bn': 'অনুরোধকৃত তারিখ'},
    'leaveNote': {'ar': 'ملاحظة إضافية (اختياري)', 'en': 'Additional note (optional)', 'bn': 'অতিরিক্ত নোট (ঐচ্ছিক)'},
    'submitLeaveRequest': {'ar': 'إرسال الطلب', 'en': 'Submit Request', 'bn': 'জমা দিন'},
    'leaveRequestSent': {'ar': 'تم إرسال طلبك بنجاح، سيصلك الرد قريبًا', 'en': 'Request sent successfully', 'bn': 'অনুরোধ সফলভাবে পাঠানো হয়েছে'},
    'myLeaveRequests': {'ar': 'طلباتي السابقة', 'en': 'My Requests', 'bn': 'আমার অনুরোধ'},
    'leaveStatusPending': {'ar': '⏳ قيد المراجعة', 'en': '⏳ Pending', 'bn': '⏳ অপেক্ষমান'},
    'leaveStatusApproved': {'ar': '✅ تمت الموافقة', 'en': '✅ Approved', 'bn': '✅ অনুমোদিত'},
    'leaveStatusRejected': {'ar': '❌ مرفوض', 'en': '❌ Rejected', 'bn': '❌ প্রত্যাখ্যাত'},
    'gpsRequired': {
      'ar': 'الرجاء تفعيل خدمة الموقع (GPS) أولاً',
      'en': 'Please enable GPS first',
      'bn': 'অনুগ্রহ করে প্রথমে GPS চালু করুন',
    },
    'permissionRequired': {
      'ar': 'يجب منح إذن الوصول للموقع لاستخدام التطبيق',
      'en': 'Location permission is required to use the app',
      'bn': 'অ্যাপ ব্যবহার করতে অবস্থানের অনুমতি প্রয়োজন',
    },
    'loginError': {'ar': 'بيانات الدخول غير صحيحة', 'en': 'Invalid login credentials', 'bn': 'ভুল লগইন তথ্য'},
    'connectionError': {
      'ar': 'تعذّر الاتصال بالخادم، تحقق من الإنترنت',
      'en': 'Could not reach the server, check your internet',
      'bn': 'সার্ভারে সংযোগ করা যায়নি, ইন্টারনেট পরীক্ষা করুন',
    },
    'logout': {'ar': 'تسجيل الخروج', 'en': 'Logout', 'bn': 'লগআউট'},
    'welcome': {'ar': 'مرحباً', 'en': 'Welcome', 'bn': 'স্বাগতম'},
    'myDailyReport': {'ar': 'تقريري اليومي', 'en': 'My Daily Report', 'bn': 'আমার দৈনিক প্রতিবেদন'},
    'hoursWorked': {'ar': 'ساعات العمل', 'en': 'Hours Worked', 'bn': 'কাজের ঘন্টা'},
    'distanceCovered': {'ar': 'المسافة المقطوعة', 'en': 'Distance Covered', 'bn': 'অতিক্রান্ত দূরত্ব'},
    'todayRating': {'ar': 'تقييم اليوم', 'en': "Today's Rating", 'bn': 'আজকের রেটিং'},
    'loadingReport': {'ar': 'جاري تحميل تقريرك...', 'en': 'Loading your report...', 'bn': 'আপনার প্রতিবেদন লোড হচ্ছে...'},
    'noReportYet': {
      'ar': 'لا توجد بيانات بعد اليوم، ابدأ دوامك أولاً',
      'en': 'No data yet today, start your shift first',
      'bn': 'আজ এখনো কোনো তথ্য নেই, প্রথমে আপনার শিফট শুরু করুন',
    },
    'back': {'ar': 'رجوع', 'en': 'Back', 'bn': 'পিছনে'},
    'dailyLog': {'ar': 'سجل التوصيلات اليومي', 'en': 'Daily Delivery Log', 'bn': 'দৈনিক ডেলিভারি লগ'},
    'completed': {'ar': 'ناجحة', 'en': 'Completed', 'bn': 'সম্পন্ন'},
    'failed': {'ar': 'فاشلة', 'en': 'Failed', 'bn': 'ব্যর্থ'},
    'total': {'ar': 'الإجمالي', 'en': 'Total', 'bn': 'মোট'},
    'addDelivery': {'ar': '+ إضافة نتيجة توصيل', 'en': '+ Add Delivery Result', 'bn': '+ ডেলিভারি ফলাফল যোগ করুন'},
    'deliverySucceeded': {'ar': 'نجحت التوصيلة', 'en': 'Delivery Succeeded', 'bn': 'ডেলিভারি সফল'},
    'deliveryFailed': {'ar': 'فشلت التوصيلة', 'en': 'Delivery Failed', 'bn': 'ডেলিভারি ব্যর্থ'},
    'failureReason': {'ar': 'سبب الفشل', 'en': 'Failure Reason', 'bn': 'ব্যর্থতার কারণ'},
    'verificationMethod': {'ar': 'طريقة التحقق', 'en': 'Verification Method', 'bn': 'যাচাই পদ্ধতি'},
    'save': {'ar': 'حفظ', 'en': 'Save', 'bn': 'সংরক্ষণ'},
    'cancel': {'ar': 'إلغاء', 'en': 'Cancel', 'bn': 'বাতিল'},
    'noDeliveriesToday': {'ar': 'لا توجد توصيلات مسجلة في هذا اليوم', 'en': 'No deliveries recorded this day', 'bn': 'এই দিনে কোনো ডেলিভারি নেই'},
    'deleteConfirm': {'ar': 'حذف هذا التسجيل؟', 'en': 'Delete this entry?', 'bn': 'এই এন্ট্রি মুছবেন?'},
    'reasonCustomerAbsent': {'ar': 'العميل غير متواجد', 'en': 'Customer absent', 'bn': 'গ্রাহক অনুপস্থিত'},
    'reasonRefused': {'ar': 'رفض الاستلام', 'en': 'Refused delivery', 'bn': 'ডেলিভারি প্রত্যাখ্যান'},
    'reasonWrongAddress': {'ar': 'عنوان خاطئ', 'en': 'Wrong address', 'bn': 'ভুল ঠিকানা'},
    'reasonOther': {'ar': 'أخرى', 'en': 'Other', 'bn': 'অন্যান্য'},
    'verifySignature': {'ar': 'توقيع العميل', 'en': "Customer signature", 'bn': 'গ্রাহকের স্বাক্ষর'},
    'verifyOtp': {'ar': 'رمز تحقق (OTP)', 'en': 'OTP code', 'bn': 'OTP কোড'},
    'verifyPhoto': {'ar': 'صورة التسليم', 'en': 'Delivery photo', 'bn': 'ডেলিভারি ছবি'},
    'performanceReport': {'ar': 'تقرير أدائي', 'en': 'My Performance', 'bn': 'আমার পারফরম্যান্স'},
    'ordersAccepted': {'ar': 'طلبات مقبولة', 'en': 'Accepted Orders', 'bn': 'গৃহীত অর্ডার'},
    'ordersRejected': {'ar': 'طلبات مرفوضة', 'en': 'Rejected Orders', 'bn': 'প্রত্যাখ্যাত অর্ডার'},
    'verificationCount': {'ar': 'عدد التحقق', 'en': 'Verifications', 'bn': 'যাচাইকরণ'},
    'noPerformanceData': {
      'ar': 'لم يصل تقرير أداء لهذا اليوم بعد',
      'en': 'No performance report for this day yet',
      'bn': 'এই দিনের জন্য এখনো কোনো প্রতিবেদন নেই',
    },
    'category': {'ar': 'الفئة', 'en': 'Category', 'bn': 'বিভাগ'},
    'messages': {'ar': 'الرسائل', 'en': 'Messages', 'bn': 'বার্তা'},
    'typeMessage': {'ar': 'اكتب رسالة...', 'en': 'Type a message...', 'bn': 'একটি বার্তা টাইপ করুন...'},
    'send': {'ar': 'إرسال', 'en': 'Send', 'bn': 'পাঠান'},
    'noMessagesYet': {'ar': 'لا توجد رسائل بعد', 'en': 'No messages yet', 'bn': 'এখনো কোনো বার্তা নেই'},
  };

  static String get(String key) {
    return _values[key]?[currentLang] ?? _values[key]?['ar'] ?? key;
  }
}
