import 'dart:async';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:geolocator/geolocator.dart';
import 'package:battery_plus/battery_plus.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';

/// خدمة التتبع الخلفي: تعمل حتى لو أُغلق التطبيق من الشاشة الأخيرة (على أندرويد،
/// عبر Foreground Service بإشعار دائم يمنع النظام من قتل العملية).
class LocationService {
  static Future<void> initialize() async {
    final service = FlutterBackgroundService();

    // ⚠️ الخطوة الحاسمة: يجب إنشاء "قناة الإشعار" فعليًا قبل تشغيل الخدمة،
    // وإلا يرفض نظام أندرويد عرض الإشعار ويوقف التطبيق بالكامل فورًا (على مستوى النظام،
    // وهو ما لا يمكن لأي try/catch في Dart اعتراضه).
    const channel = AndroidNotificationChannel(
      'nahj_tracking_channel',
      'تتبع نهج للتوصيل',
      description: 'إشعار دائم أثناء تتبع موقعك في وضع العمل',
      importance: Importance.low,
    );

    final notificationsPlugin = FlutterLocalNotificationsPlugin();
    await notificationsPlugin.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
    );
    await notificationsPlugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);

    await service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: onServiceStart,
        autoStart: false, // يبدأ فقط بعد تسجيل الدخول وبدء الدوام
        isForegroundMode: true,
        notificationChannelId: 'nahj_tracking_channel',
        initialNotificationTitle: 'نهج للتوصيل',
        initialNotificationContent: 'جاري تتبع الموقع أثناء الدوام',
        foregroundServiceNotificationId: 888,
      ),
      iosConfiguration: IosConfiguration(
        autoStart: false,
        onForeground: onServiceStart,
        onBackground: onIosBackground,
      ),
    );
  }

  static Future<void> start() async {
    final service = FlutterBackgroundService();
    await service.startService();
  }

  static Future<void> stop() async {
    final service = FlutterBackgroundService();
    service.invoke('stopService');
  }
}

@pragma('vm:entry-point')
Future<bool> onIosBackground(ServiceInstance service) async {
  return true;
}

@pragma('vm:entry-point')
void onServiceStart(ServiceInstance service) async {
  try {
    await _runServiceLoop(service);
  } catch (e, st) {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('last_crash_log', '[${DateTime.now().toIso8601String()}]\nخطأ داخل خدمة التتبع الخلفية: $e\n$st');
    } catch (_) {}
  }
}

Future<void> _runServiceLoop(ServiceInstance service) async {
  final battery = Battery();
  Timer? timer;

  service.on('stopService').listen((event) {
    timer?.cancel();
    service.stopSelf();
  });

  // إرسال نقطة كل 8 ثوانٍ (ضمن النطاق المطلوب 5-10 ثوانٍ)
  const interval = Duration(seconds: 8);

  Future<void> sendUpdate() async {
    try {
      final hasPermission = await _ensureLocationPermission();
      final gpsEnabled = await Geolocator.isLocationServiceEnabled();

      final connectivityResult = await Connectivity().checkConnectivity();
      final isConnected = connectivityResult.isNotEmpty &&
          !connectivityResult.contains(ConnectivityResult.none);

      double lat = 0, lng = 0, speed = 0, accuracy = 0;
      if (hasPermission && gpsEnabled) {
        final position = await Geolocator.getCurrentPosition().timeout(
          const Duration(seconds: 8),
        );
        lat = position.latitude;
        lng = position.longitude;
        speed = (position.speed * 3.6).clamp(0, 999); // م/ث -> كم/س
        accuracy = position.accuracy;
      }

      final batteryLevel = await battery.batteryLevel;
      final batteryState = await battery.batteryState;

      if (service is AndroidServiceInstance) {
        final pendingCount = await ApiService.pendingQueueCount();
        String content;
        if (!gpsEnabled) {
          content = '⚠️ الرجاء تفعيل GPS';
        } else if (!isConnected) {
          content = '📡 لا يوجد إنترنت - سيتم إرسال $pendingCount نقطة مؤجلة عند العودة';
        } else if (pendingCount > 0) {
          content = 'جاري إرسال $pendingCount نقطة مؤجلة...';
        } else {
          content = 'يتم إرسال موقعك كل 8 ثوانٍ';
        }
        service.setForegroundNotificationInfo(
          title: 'نهج للتوصيل - أنت في وضع العمل',
          content: content,
        );
      }

      if (hasPermission && gpsEnabled && lat != 0) {
        await ApiService.sendLocation({
          'lat': lat,
          'lng': lng,
          'speed': speed,
          'accuracy': accuracy,
          'battery': batteryLevel,
          'isCharging': batteryState == BatteryState.charging,
          'gpsEnabled': true,
          'isInternetConnected': isConnected,
        });
        // عند فشل الإرسال بسبب انقطاع مؤقت، سيُعاد إرسال أحدث نقطة تلقائياً
        // في الدورة القادمة (كل 8 ثوانٍ) فور عودة الإنترنت - لا حاجة لطابور تخزين معقد
        // لأن الفارق الزمني صغير جداً ولا يؤثر على دقة التتبع اللحظي.
      } else if (!gpsEnabled) {
        await ApiService.sendLocation({
          'lat': lat, 'lng': lng, 'speed': 0, 'accuracy': 0,
          'battery': batteryLevel, 'isCharging': batteryState == BatteryState.charging,
          'gpsEnabled': false, 'isInternetConnected': isConnected,
        });
      }
    } catch (_) {
      // تجاهل الخطأ والمحاولة مجدداً في الدورة القادمة (يشمل انقطاع الإنترنت)
    }
  }

  await sendUpdate();
  timer = Timer.periodic(interval, (_) => sendUpdate());
}

Future<bool> _ensureLocationPermission() async {
  LocationPermission permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  return permission == LocationPermission.always ||
      permission == LocationPermission.whileInUse;
}
