import 'dart:async';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:geolocator/geolocator.dart';
import 'package:battery_plus/battery_plus.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';

const Map<String, Map<String, List<String>>> _timedMessages = {
  'morning': {
    'ar': ['☀️ صباح الخير يا بطل', '🌅 نتمنى لك صباحًا مثمرًا', '☕ صباح النشاط والحيوية'],
    'en': ['☀️ Good morning, champion', '🌅 Wishing you a productive morning'],
    'bn': ['☀️ শুভ সকাল, চ্যাম্পিয়ন', '🌅 আপনার জন্য একটি ফলপ্রসূ সকাল কামনা করি'],
  },
  'afternoon': {
    'ar': ['🚗 نتمنى لك يوماً موفقاً', '💪 استمر بنفس النشاط', '🎁 كل طلب تنجزه يقربك من مكافآتك'],
    'en': ['🚗 Wishing you a great day', '💪 Keep up the great work'],
    'bn': ['🚗 আপনার জন্য একটি চমৎকার দিন কামনা করি', '💪 একই উদ্যমে কাজ চালিয়ে যান'],
  },
  'evening': {
    'ar': ['🌆 مساء الخير، شكراً لجهودك اليوم', '⭐ جهودك محل تقدير', '🏆 حافظ على تقييمك المرتفع'],
    'en': ['🌆 Good evening, thanks for your effort today', '⭐ Your effort is appreciated'],
    'bn': ['🌆 শুভ সন্ধ্যা, আজকের প্রচেষ্টার জন্য ধন্যবাদ', '⭐ আপনার প্রচেষ্টা প্রশংসিত'],
  },
  'night': {
    'ar': ['🌙 نتمنى لك قيادة آمنة', '💙 أنت جزء مهم من فريق نهج للتوصيل'],
    'en': ['🌙 Drive safely', '💙 You are a valued part of our team'],
    'bn': ['🌙 নিরাপদে গাড়ি চালান', '💙 আপনি আমাদের দলের একটি মূল্যবান অংশ'],
  },
};

String _lastMotivationalMessage = '';

String _pickMotivationalMessage(String lang) {
  final hour = DateTime.now().hour;
  final period = hour < 12 ? 'morning' : (hour < 17 ? 'afternoon' : (hour < 20 ? 'evening' : 'night'));
  final pool = _timedMessages[period]?[lang] ?? _timedMessages[period]?['ar'] ?? ['نهج للتوصيل'];
  final candidates = pool.where((m) => m != _lastMotivationalMessage).toList();
  final chosen = (candidates.isEmpty ? pool : candidates)[DateTime.now().millisecond % (candidates.isEmpty ? pool.length : candidates.length)];
  _lastMotivationalMessage = chosen;
  return chosen;
}

class LocationService {
  static Future<void> initialize() async {
    final service = FlutterBackgroundService();

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
        autoStart: false,
        isForegroundMode: true,
        notificationChannelId: 'nahj_tracking_channel',
        initialNotificationTitle: 'نهج للتوصيل',
        initialNotificationContent: 'جاري تفعيل سجل الحضور',
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
        speed = (position.speed * 3.6).clamp(0, 999);
        accuracy = position.accuracy;
      }

      final batteryLevel = await battery.batteryLevel;
      final batteryState = await battery.batteryState;

      if (service is AndroidServiceInstance) {
        final pendingCount = await ApiService.pendingQueueCount();
        String content;
        if (!gpsEnabled) {
          content = '⚠️ الرجاء تفعيل GPS لاستمرار تسجيل حضورك';
        } else if (!isConnected) {
          content = '📡 لا يوجد إنترنت حاليًا، سيُستأنف تلقائيًا عند العودة';
        } else if (pendingCount > 0) {
          content = 'جاري مزامنة سجل حضورك...';
        } else {
          final prefs = await SharedPreferences.getInstance();
          final lang = prefs.getString('app_language') ?? 'ar';
          content = _pickMotivationalMessage(lang);
        }
        service.setForegroundNotificationInfo(
          title: 'نهج للتوصيل - في العمل',
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
      } else if (!gpsEnabled) {
        await ApiService.sendLocation({
          'lat': lat, 'lng': lng, 'speed': 0, 'accuracy': 0,
          'battery': batteryLevel, 'isCharging': batteryState == BatteryState.charging,
          'gpsEnabled': false, 'isInternetConnected': isConnected,
        });
      }
    } catch (_) {}
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
