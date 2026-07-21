import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;
import 'services/location_service.dart';
import 'services/app_strings.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/permission_gate_screen.dart';

// يجب أن تكون دالة مستقلة على المستوى الأعلى (وليست داخل كلاس) ليستطيع نظام
// أندرويد استدعاءها حتى لو كان التطبيق مغلقًا تمامًا وقت وصول الإشعار.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // ✅ أوامر التتبع المباشر عند الطلب - هذه الآلية الوحيدة لأي إرسال GPS في كامل التطبيق الآن
  if (message.data['type'] == 'location_request') {
    try {
      await LocationService.sendSingleLocationUpdate();
    } catch (_) {}
    return;
  }
  if (message.data['type'] == 'start_live_tracking') {
    try {
      await LocationService.startLiveTracking();
    } catch (_) {}
    return;
  }
  if (message.data['type'] == 'stop_live_tracking') {
    LocationService.stopLiveTracking();
    return;
  }
  // لبقية الإشعارات العادية: لا حاجة لأي كود هنا، نظام أندرويد يعرضها تلقائيًا من حقل "notification".
}

Future<void> main() async {
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();

    try {
      tz_data.initializeTimeZones();
    } catch (_) {}

    FlutterError.onError = (FlutterErrorDetails details) async {
      await _saveCrashLog('Flutter Error: ${details.exceptionAsString()}\n${details.stack}');
    };

    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
    } catch (e, st) {
      await _saveCrashLog('فشل تهيئة الإشعارات: $e\n$st');
    }

    try {
      await LocationService.initialize();
    } catch (e, st) {
      await _saveCrashLog('فشل تهيئة خدمة الموقع: $e\n$st');
    }

    await AppStrings.loadSavedLanguage();
    runApp(const NahjDeliveryApp());
  }, (error, stack) async {
    await _saveCrashLog('خطأ غير متزامن (Uncaught): $error\n$stack');
  });
}

Future<void> _saveCrashLog(String message) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final time = DateTime.now().toIso8601String();
    await prefs.setString('last_crash_log', '[$time]\n$message');
  } catch (_) {
    // لا شيء يمكن فعله إن فشل حتى التسجيل نفسه
  }
}

class NahjDeliveryApp extends StatelessWidget {
  const NahjDeliveryApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: AppStrings.languageNotifier,
      builder: (context, lang, _) {
        final isRtl = lang == 'ar';
        return MaterialApp(
          title: 'نهج للتوصيل',
          debugShowCheckedModeBanner: false,
          locale: Locale(lang),
          supportedLocales: const [Locale('ar'), Locale('en'), Locale('bn')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          theme: ThemeData(
            primaryColor: const Color(0xFF0F172A),
            colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F172A)),
            useMaterial3: true,
          ),
          builder: (context, child) {
            return Directionality(
              textDirection: isRtl ? TextDirection.rtl : TextDirection.ltr,
              child: child!,
            );
          },
          home: const _StartupRouter(),
        );
      },
    );
  }
}

/// يتحقق إن كان هناك جلسة محفوظة مسبقاً وينقل المستخدم للشاشة المناسبة
class _StartupRouter extends StatelessWidget {
  const _StartupRouter();

  Future<bool> _hasSession() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('token') != null;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<bool>(
      future: _hasSession(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        return snapshot.data! ? const PermissionGateScreen() : const LoginScreen();
      },
    );
  }
}
