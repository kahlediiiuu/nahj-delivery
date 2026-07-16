import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../services/app_strings.dart';
import 'login_screen.dart';
import 'my_report_screen.dart';
import 'daily_log_screen.dart';
import 'performance_report_screen.dart';
import 'messages_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _onShift = false;
  bool _loading = false;
  String _driverName = '';
  int _unreadMessages = 0;
  Timer? _unreadTimer;

  @override
  void initState() {
    super.initState();
    _loadName();
    _refreshUnread();
    _checkLastCrash();
    _unreadTimer = Timer.periodic(const Duration(seconds: 15), (_) => _refreshUnread());
  }

  Future<void> _checkLastCrash() async {
    final prefs = await SharedPreferences.getInstance();
    final log = prefs.getString('last_crash_log');
    if (log != null && mounted) {
      await prefs.remove('last_crash_log');
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('سجل آخر عطل (أرسل هذا النص للدعم الفني)'),
          content: SingleChildScrollView(child: SelectableText(log)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إغلاق')),
          ],
        ),
      );
    }
  }

  @override
  void dispose() {
    _unreadTimer?.cancel();
    super.dispose();
  }

  final _notificationsPlugin = FlutterLocalNotificationsPlugin();
  bool _notificationsReady = false;

  Future<void> _ensureNotificationChannel() async {
    if (_notificationsReady) return;
    const channel = AndroidNotificationChannel(
      'nahj_messages_channel',
      'رسائل نهج للتوصيل',
      description: 'إشعار عند وصول رسالة جديدة من الإدارة',
      importance: Importance.high,
      playSound: true,
    );
    await _notificationsPlugin.initialize(
      const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
    );
    await _notificationsPlugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
    _notificationsReady = true;
  }

  bool _firstUnreadCheck = true;

  Future<void> _refreshUnread() async {
    await _ensureNotificationChannel();
    final count = await ApiService.getUnreadMessageCount();
    if (!_firstUnreadCheck && count > _unreadMessages) {
      await _notificationsPlugin.show(
        901,
        'رسالة جديدة من الإدارة',
        'لديك رسالة جديدة، اضغط لعرضها',
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'nahj_messages_channel',
            'رسائل نهج للتوصيل',
            importance: Importance.high,
            priority: Priority.high,
            playSound: true,
          ),
        ),
      );
    }
    _firstUnreadCheck = false;
    if (mounted) setState(() => _unreadMessages = count);
  }

  Future<void> _loadName() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() => _driverName = prefs.getString('driverName') ?? '');
  }

  Future<void> _toggleShift() async {
    setState(() => _loading = true);
    try {
      if (!_onShift) {
        final ok = await ApiService.startShift();
        if (ok) {
          try {
            await LocationService.start();
          } catch (e) {
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('تعذّر بدء التتبع: $e'), backgroundColor: Colors.red),
              );
            }
          }
          setState(() => _onShift = true);
        } else {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('تعذّر بدء الدوام، تحقق من الاتصال'), backgroundColor: Colors.red),
            );
          }
        }
      } else {
        await ApiService.endShift();
        await LocationService.stop();
        setState(() => _onShift = false);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('خطأ: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _logout() async {
    if (_onShift) {
      await ApiService.endShift();
      await LocationService.stop();
    }
    await ApiService.clearSession();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const LoginScreen()));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${AppStrings.get("welcome")}، $_driverName'),
        actions: [
          Stack(
            children: [
              IconButton(
                icon: const Icon(Icons.chat_bubble_outline),
                onPressed: () async {
                  await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const MessagesScreen()));
                  _refreshUnread();
                },
              ),
              if (_unreadMessages > 0)
                Positioned(
                  right: 8, top: 8,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                    child: Text('$_unreadMessages', style: const TextStyle(color: Colors.white, fontSize: 10)),
                  ),
                ),
            ],
          ),
          IconButton(icon: const Icon(Icons.logout), onPressed: _logout),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              _onShift ? Icons.location_on : Icons.location_off,
              size: 100,
              color: _onShift ? Colors.green : Colors.grey,
            ),
            const SizedBox(height: 16),
            Text(
              _onShift ? AppStrings.get('onShift') : AppStrings.get('offShift'),
              style: const TextStyle(fontSize: 18),
            ),
            const SizedBox(height: 40),
            ElevatedButton.icon(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PerformanceReportScreen()),
              ),
              icon: const Icon(Icons.workspace_premium),
              label: Text(AppStrings.get('performanceReport')),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.indigo, padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 14)),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loading ? null : _toggleShift,
              style: ElevatedButton.styleFrom(
                backgroundColor: _onShift ? Colors.red : Colors.green,
                padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 16),
              ),
              child: _loading
                  ? const CircularProgressIndicator(color: Colors.white)
                  : Text(
                      _onShift ? AppStrings.get('endShift') : AppStrings.get('startShift'),
                      style: const TextStyle(fontSize: 16, color: Colors.white),
                    ),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const MyReportScreen()),
              ),
              icon: const Icon(Icons.bar_chart),
              label: Text(AppStrings.get('myDailyReport')),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const DailyLogScreen()),
              ),
              icon: const Icon(Icons.checklist),
              label: Text(AppStrings.get('dailyLog')),
            ),
          ],
        ),
      ),
    );
  }
}
