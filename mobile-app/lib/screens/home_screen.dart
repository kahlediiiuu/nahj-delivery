import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../services/app_strings.dart';
import 'login_screen.dart';
import 'my_report_screen.dart';
import 'daily_log_screen.dart';
import 'performance_report_screen.dart';
import 'messages_screen.dart';
import 'leave_request_screen.dart';
import 'work_hours_screen.dart';
import 'daily_notes_screen.dart';
import 'announcements_screen.dart';
import 'alarm_screen.dart';

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
  int _consecutiveDays = 0;
  String? _whatsappNumber;
  String? _phoneNumber;
  String _currentGrade = '';
  String _currentGradeLabel = '';

  @override
  void initState() {
    super.initState();
    _loadName();
    _syncShiftStatus();
    _refreshUnread();
    _checkLastCrash();
    _setupPushNotifications();
    _loadAchievements();
    _loadContactInfo();
    ApiService.registerLanguage(AppStrings.currentLang);
    _unreadTimer = Timer.periodic(const Duration(seconds: 15), (_) => _refreshUnread());
  }

  Future<void> _loadAchievements() async {
    try {
      final result = await ApiService.getMyReport();
      if (mounted) {
        setState(() => _consecutiveDays = result['consecutiveDays'] ?? 0);
      }
    } catch (_) {}
    try {
      final perf = await ApiService.getMyPerformance();
      if (mounted && perf['found'] == true) {
        setState(() {
          _currentGrade = perf['grade']?.toString() ?? '';
          _currentGradeLabel = perf['categoryLabel']?.toString() ?? '';
        });
      }
    } catch (_) {}
  }

  String _timeBasedGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return AppStrings.currentLang == 'ar' ? 'صباح الخير' : (AppStrings.currentLang == 'bn' ? 'শুভ সকাল' : 'Good morning');
    if (hour < 17) return AppStrings.currentLang == 'ar' ? 'مساء الخير' : (AppStrings.currentLang == 'bn' ? 'শুভ বিকাল' : 'Good afternoon');
    return AppStrings.currentLang == 'ar' ? 'مساء الخير' : (AppStrings.currentLang == 'bn' ? 'শুভ সন্ধ্যা' : 'Good evening');
  }

  Future<void> _loadContactInfo() async {
    try {
      final result = await ApiService.getContactInfo();
      if (mounted) {
        setState(() {
          _whatsappNumber = result['whatsappNumber'];
          _phoneNumber = result['phoneNumber'];
        });
      }
    } catch (_) {}
  }

  Future<void> _openWhatsapp() async {
    if (_whatsappNumber == null || _whatsappNumber!.isEmpty) return;
    final uri = Uri.parse('https://wa.me/$_whatsappNumber');
    if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _callAdmin() async {
    if (_phoneNumber == null || _phoneNumber!.isEmpty) return;
    final uri = Uri.parse('tel:$_phoneNumber');
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  Future<void> _syncShiftStatus() async {
    try {
      final result = await ApiService.getMyReport();
      final reallyOnShift = result['onShift'] == true;
      if (mounted) setState(() => _onShift = reallyOnShift);
      if (reallyOnShift) {
        try {
          await LocationService.start();
        } catch (_) {}
      }
    } catch (_) {}
  }

  Future<void> _setupPushNotifications() async {
    try {
      await FirebaseMessaging.instance.requestPermission();
      final fcmToken = await FirebaseMessaging.instance.getToken();
      if (fcmToken != null) {
        await ApiService.registerFcmToken(fcmToken);
      }
      FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
        ApiService.registerFcmToken(newToken);
      });

      FirebaseMessaging.onMessage.listen((message) {
        _refreshUnread();
        if (message.data['requiresResponse'] == 'true' && message.data['messageId'] != null) {
          _showMandatoryResponseDialog(
            message.data['messageId']!,
            message.notification?.body ?? '',
          );
        }
      });
    } catch (_) {}
  }

  void _showMandatoryResponseDialog(String messageId, String alertText) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          title: const Text('⚠️ تنبيه يتطلب ردك الفوري'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(alertText),
              const SizedBox(height: 16),
              const Text('اكتب سبب ذلك للرد على الإدارة:'),
              const SizedBox(height: 8),
              TextField(
                controller: controller,
                maxLines: 3,
                decoration: const InputDecoration(border: OutlineInputBorder(), hintText: 'اكتب ردك هنا...'),
              ),
            ],
          ),
          actions: [
            ElevatedButton(
              onPressed: () async {
                final text = controller.text.trim();
                if (text.isEmpty) return;
                await ApiService.respondToMessage(messageId, text);
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('إرسال الرد'),
            ),
          ],
        ),
      ),
    );
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
    const silentChannel = AndroidNotificationChannel(
      'nahj_messages_silent_channel',
      'رسائل نهج للتوصيل (بدون صوت)',
      description: 'إشعار نصي عادي بدون صوت',
      importance: Importance.high,
      playSound: false,
    );
    await _notificationsPlugin.initialize(
      const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
    );
    await _notificationsPlugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
    await _notificationsPlugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(silentChannel);
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
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        elevation: 0,
        backgroundColor: const Color(0xFF0F172A),
        title: Text('${_timeBasedGreeting()}، $_driverName', style: const TextStyle(fontSize: 17)),
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
      body: RefreshIndicator(
        onRefresh: () async {
          await _loadAchievements();
          await _syncShiftStatus();
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFF0F172A), Color(0xFF1E293B)]),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.15), blurRadius: 12, offset: const Offset(0, 6))],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 10, height: 10,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: _onShift ? Colors.greenAccent : Colors.white38,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _onShift ? AppStrings.get('onShift') : AppStrings.get('offShift'),
                            style: const TextStyle(color: Colors.white70, fontSize: 13),
                          ),
                        ],
                      ),
                      if (_consecutiveDays > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(color: Colors.amber.withOpacity(0.2), borderRadius: BorderRadius.circular(20)),
                          child: Text('🔥 $_consecutiveDays يوم متتالي', style: const TextStyle(color: Colors.amber, fontSize: 11, fontWeight: FontWeight.bold)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _loading ? null : _toggleShift,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _onShift ? Colors.red.shade400 : Colors.green.shade400,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      child: _loading
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : Text(
                              _onShift ? AppStrings.get('endShift') : AppStrings.get('startShift'),
                              style: const TextStyle(fontSize: 16, color: Colors.white, fontWeight: FontWeight.bold),
                            ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            if (_currentGrade.isNotEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
                child: Row(
                  children: [
                    const Text('🏆', style: TextStyle(fontSize: 26)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('فئتك الحالية', style: TextStyle(fontSize: 11, color: Colors.grey)),
                          Text(_currentGradeLabel, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                        ],
                      ),
                    ),
                    if (_unreadMessages > 0)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(color: Colors.red.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
                        child: Text('🔔 $_unreadMessages', style: const TextStyle(color: Colors.red, fontWeight: FontWeight.bold, fontSize: 12)),
                      ),
                  ],
                ),
              ),

            const SizedBox(height: 20),

            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.3,
              children: [
                _featureCard('🏆', AppStrings.get('performanceReport'), Colors.indigo, () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PerformanceReportScreen()))),
                _featureCard('📦', AppStrings.get('dailyLog'), Colors.teal, () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DailyLogScreen()))),
                _featureCard('🗓️', AppStrings.get('requestLeave'), Colors.deepPurple, () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LeaveRequestScreen()))),
                _featureCard('⏱️', 'ساعات عملي', Colors.blue, () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const WorkHoursScreen()))),
                _featureCard('📝', 'ملاحظة يومية', Colors.orange, () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DailyNotesScreen()))),
                _featureCard('📊', AppStrings.get('myDailyReport'), Colors.blueGrey, () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const MyReportScreen()))),
                _featureCard('📢', 'أخبار الشركة', Colors.pink, () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AnnouncementsScreen()))),
                _featureCard('⏰', 'منبه بدء الدوام', Colors.amber, () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AlarmScreen()))),
              ],
            ),

            if ((_whatsappNumber?.isNotEmpty ?? false) || (_phoneNumber?.isNotEmpty ?? false)) ...[
              const SizedBox(height: 24),
              Center(child: Text('تواصل مباشر مع الإدارة', style: TextStyle(color: Colors.grey.shade600, fontSize: 13))),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (_whatsappNumber?.isNotEmpty ?? false)
                    ElevatedButton.icon(
                      onPressed: _openWhatsapp,
                      icon: const Icon(Icons.chat, size: 20),
                      label: const Text('واتساب'),
                      style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF25D366), foregroundColor: Colors.white),
                    ),
                  if ((_whatsappNumber?.isNotEmpty ?? false) && (_phoneNumber?.isNotEmpty ?? false))
                    const SizedBox(width: 12),
                  if (_phoneNumber?.isNotEmpty ?? false)
                    ElevatedButton.icon(
                      onPressed: _callAdmin,
                      icon: const Icon(Icons.call, size: 20),
                      label: const Text('اتصال'),
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.blue, foregroundColor: Colors.white),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _featureCard(String emoji, String label, Color color, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withOpacity(0.15)),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 3))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
              child: Text(emoji, style: const TextStyle(fontSize: 22)),
            ),
            const SizedBox(height: 10),
            Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13), maxLines: 2),
          ],
        ),
      ),
    );
  }
}
