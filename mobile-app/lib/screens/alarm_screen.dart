import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/timezone.dart' as tz;

class AlarmScreen extends StatefulWidget {
  const AlarmScreen({super.key});

  @override
  State<AlarmScreen> createState() => _AlarmScreenState();
}

class _AlarmScreenState extends State<AlarmScreen> {
  final _notificationsPlugin = FlutterLocalNotificationsPlugin();
  TimeOfDay? _alarmTime;
  bool _enabled = false;
  bool _loading = true;

  static const int _alarmNotificationId = 777;
  static const _prefsKeyHour = 'alarm_hour';
  static const _prefsKeyMinute = 'alarm_minute';
  static const _prefsKeyEnabled = 'alarm_enabled';

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await _notificationsPlugin.initialize(
      const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
    );
    const channel = AndroidNotificationChannel(
      'nahj_alarm_channel_v2',
      'منبه بدء الدوام',
      description: 'تذكير يومي ببدء دوامك حتى لا تفوّت أي شفت',
      importance: Importance.max,
      playSound: true,
      // نستخدم صوت أندرويد الافتراضي عمدًا (بدون تحديد ملف صوت مخصص) لأن أي ملف صوت مخصص
      // يتطلب إضافته فعليًا لمجلد android/app/src/main/res/raw وهو غير موجود حاليًا في المشروع
    );
    await _notificationsPlugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);

    final prefs = await SharedPreferences.getInstance();
    final hour = prefs.getInt(_prefsKeyHour);
    final minute = prefs.getInt(_prefsKeyMinute);
    final enabled = prefs.getBool(_prefsKeyEnabled) ?? false;

    setState(() {
      _alarmTime = (hour != null && minute != null) ? TimeOfDay(hour: hour, minute: minute) : null;
      _enabled = enabled;
      _loading = false;
    });
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _alarmTime ?? const TimeOfDay(hour: 8, minute: 0),
      helpText: 'اختر وقت التذكير اليومي',
    );
    if (picked == null) return;
    setState(() => _alarmTime = picked);
    await _saveAndSchedule(enable: true);
  }

  Future<void> _toggleEnabled(bool value) async {
    if (value && _alarmTime == null) {
      await _pickTime();
      return;
    }
    setState(() => _enabled = value);
    await _saveAndSchedule(enable: value);
  }

  Future<void> _saveAndSchedule({required bool enable}) async {
    final prefs = await SharedPreferences.getInstance();
    if (_alarmTime != null) {
      await prefs.setInt(_prefsKeyHour, _alarmTime!.hour);
      await prefs.setInt(_prefsKeyMinute, _alarmTime!.minute);
    }
    await prefs.setBool(_prefsKeyEnabled, enable);
    setState(() => _enabled = enable);

    if (enable && _alarmTime != null) {
      await _scheduleDailyAlarm(_alarmTime!);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تم ضبط المنبه يوميًا الساعة ${_alarmTime!.format(context)}'), backgroundColor: Colors.green),
        );
      }
    } else {
      await _notificationsPlugin.cancel(_alarmNotificationId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم إيقاف المنبه'), backgroundColor: Colors.grey),
        );
      }
    }
  }

  /// يجدول إشعارًا محليًا يتكرر كل يوم في نفس الوقت - هذا يعمل بالكامل على الجهاز
  /// (لا يحتاج إنترنت، ولا اتصالًا بالخادم، ولا علاقة له إطلاقًا بخدمة تتبع الموقع).
  Future<void> _scheduleDailyAlarm(TimeOfDay time) async {
    final now = tz.TZDateTime.now(tz.local);
    var scheduled = tz.TZDateTime(tz.local, now.year, now.month, now.day, time.hour, time.minute);
    if (scheduled.isBefore(now)) {
      scheduled = scheduled.add(const Duration(days: 1));
    }

    await _notificationsPlugin.zonedSchedule(
      _alarmNotificationId,
      '⏰ حان وقت العمل!',
      'لا تفوّت شفتك اليوم، افتح التطبيق وابدأ دوامك 💪',
      scheduled,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'nahj_alarm_channel_v2',
          'منبه بدء الدوام',
          importance: Importance.max,
          priority: Priority.high,
          playSound: true,
          fullScreenIntent: true,
        ),
      ),
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.absoluteTime,
      matchDateTimeComponents: DateTimeComponents.time, // يتكرر يوميًا بنفس الوقت تلقائيًا
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(title: const Text('⏰ منبه بدء الدوام')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: Colors.blue.withOpacity(0.08), borderRadius: BorderRadius.circular(12)),
                  child: const Row(
                    children: [
                      Icon(Icons.info_outline, color: Colors.blue, size: 20),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'هذا المنبه يعمل على جوالك مباشرة، حتى بدون إنترنت.',
                          style: TextStyle(fontSize: 12.5, color: Colors.blueGrey),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 30),
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Color(0xFF0F172A), Color(0xFF1E293B)]),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Column(
                    children: [
                      const Text('🔔', style: TextStyle(fontSize: 48)),
                      const SizedBox(height: 12),
                      Text(
                        _alarmTime != null ? _alarmTime!.format(context) : '--:--',
                        style: const TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _enabled ? 'المنبه مُفعَّل يوميًا' : 'المنبه متوقف',
                        style: TextStyle(color: _enabled ? Colors.greenAccent : Colors.white54, fontSize: 13),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                SwitchListTile(
                  title: const Text('تفعيل المنبه اليومي'),
                  value: _enabled,
                  onChanged: _toggleEnabled,
                  activeColor: const Color(0xFF16A34A),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _pickTime,
                  icon: const Icon(Icons.access_time),
                  label: Text(_alarmTime == null ? 'اختر وقت التذكير' : 'تغيير الوقت'),
                ),
              ],
            ),
    );
  }
}
