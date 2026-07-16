import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'services/location_service.dart';
import 'services/app_strings.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/permission_gate_screen.dart';

Future<void> main() async {
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();

    // التقاط أي خطأ من إطار عمل Flutter نفسه (بما فيه أخطاء البناء والواجهة)
    FlutterError.onError = (FlutterErrorDetails details) async {
      await _saveCrashLog('Flutter Error: ${details.exceptionAsString()}\n${details.stack}');
    };

    try {
      await LocationService.initialize();
    } catch (e, st) {
      await _saveCrashLog('فشل تهيئة خدمة الموقع: $e\n$st');
    }

    await AppStrings.loadSavedLanguage();
    runApp(const NahjDeliveryApp());
  }, (error, stack) async {
    // التقاط أي خطأ غير متزامن (Async) لم يُلتقط بأي مكان آخر - هذا غالبًا سبب "الانهيار الصامت"
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
