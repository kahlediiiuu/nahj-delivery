import 'dart:async';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:geolocator/geolocator.dart';
import 'package:battery_plus/battery_plus.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';

/// ⚠️⚠️⚠️ تحوّل معماري كامل بناءً على طلب صريح: لا يوجد أي إرسال تلقائي للموقع
/// إطلاقًا - لا كل 8 ثوانٍ، ولا كل 5 دقائق، ولا حتى عند تسجيل الحضور. الإرسال
/// يحدث فقط وفقط عند تلقّي أمر "بدء تتبع مباشر" من المشرف (عبر إشعار صامت)،
/// ويتوقف فورًا عند أمر "إيقاف"، أو تلقائيًا كحماية بعد 20 دقيقة كحد أقصى
/// (في حال ضاع أمر الإيقاف لأي سبب) لمنع استنزاف البطارية/الرصيد بلا حدود.
class LocationService {
  static Timer? _activeTrackingTimer;
  static Timer? _safetyStopTimer;
  static const Duration _liveTrackingInterval = Duration(seconds: 12);
  static const Duration _maxLiveTrackingDuration = Duration(minutes: 20);

  static Future<void> initialize() async {
    const channel = AndroidNotificationChannel(
      'nahj_tracking_channel',
      'تتبع نهج للتوصيل',
      description: 'إشعار مؤقت أثناء تتبع مباشر طلبه المشرف فقط',
      importance: Importance.low,
    );

    final notificationsPlugin = FlutterLocalNotificationsPlugin();
    await notificationsPlugin.initialize(
      const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
    );
    await notificationsPlugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
  }

  /// إرسال موقع واحد فوري فقط - يُستخدم لطلب "اطلب موقعه الآن" لمرة واحدة.
  static Future<void> sendSingleLocationUpdate() async {
    try {
      final position = await _capturePosition();
      if (position == null) return;
      await ApiService.sendLocation(await _buildPayload(position));
    } catch (_) {}
  }

  /// ✅ بدء جلسة تتبع مباشر حقيقية (تتكرر كل 12 ثانية) - لا تبدأ إلا بأمر صريح
  /// من المشرف، وتتوقف تلقائيًا كحماية بعد 20 دقيقة كحد أقصى إن لم تُوقَف يدويًا.
  static Future<void> startLiveTracking() async {
    stopLiveTracking(); // تنظيف أي جلسة سابقة أولاً لتفادي التكرار

    Future<void> tick() async {
      try {
        final position = await _capturePosition();
        if (position != null) {
          await ApiService.sendLocation(await _buildPayload(position));
        }
      } catch (_) {}
    }

    await tick();
    _activeTrackingTimer = Timer.periodic(_liveTrackingInterval, (_) => tick());

    _safetyStopTimer = Timer(_maxLiveTrackingDuration, () {
      stopLiveTracking(); // حماية تلقائية - توقف حتمي حتى لو ضاع أمر الإيقاف
    });
  }

  /// ⏹ إيقاف فوري تام لأي جلسة تتبع مباشر نشطة.
  static void stopLiveTracking() {
    _activeTrackingTimer?.cancel();
    _activeTrackingTimer = null;
    _safetyStopTimer?.cancel();
    _safetyStopTimer = null;
  }

  static Future<Position?> _capturePosition() async {
    final hasPermission = await _ensureLocationPermission();
    final gpsEnabled = await Geolocator.isLocationServiceEnabled();
    if (!hasPermission || !gpsEnabled) return null;
    return await Geolocator.getCurrentPosition().timeout(const Duration(seconds: 10));
  }

  static Future<Map<String, dynamic>> _buildPayload(Position position) async {
    final connectivityResult = await Connectivity().checkConnectivity();
    final isConnected = connectivityResult.isNotEmpty && !connectivityResult.contains(ConnectivityResult.none);
    final battery = Battery();
    final batteryLevel = await battery.batteryLevel;
    final batteryState = await battery.batteryState;

    return {
      'lat': position.latitude,
      'lng': position.longitude,
      'speed': (position.speed * 3.6).clamp(0, 999),
      'accuracy': position.accuracy,
      'battery': batteryLevel,
      'isCharging': batteryState == BatteryState.charging,
      'gpsEnabled': true,
      'isInternetConnected': isConnected,
    };
  }
}

Future<bool> _ensureLocationPermission() async {
  LocationPermission permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  return permission == LocationPermission.always || permission == LocationPermission.whileInUse;
}
