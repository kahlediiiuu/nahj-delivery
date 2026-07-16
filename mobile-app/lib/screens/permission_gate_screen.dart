import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:geolocator/geolocator.dart';
import 'home_screen.dart';

/// شاشة إلزامية تمنع المندوب من الدخول لصفحة العمل الرئيسية
/// حتى يفعّل كل الصلاحيات الضرورية لعمل التتبع بشكل مستقر بدون انقطاع.
class PermissionGateScreen extends StatefulWidget {
  const PermissionGateScreen({super.key});

  @override
  State<PermissionGateScreen> createState() => _PermissionGateScreenState();
}

class _PermissionGateScreenState extends State<PermissionGateScreen> with WidgetsBindingObserver {
  bool _locationOk = false;
  bool _backgroundLocationOk = false;
  bool _notificationOk = false;
  bool _batteryOk = false;
  bool _gpsOk = false;
  bool _checking = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refreshStatus();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // عند رجوع المندوب من شاشة إعدادات النظام، نعيد الفحص تلقائيًا
    if (state == AppLifecycleState.resumed) {
      _refreshStatus();
    }
  }

  bool get _allGranted =>
      _locationOk && _backgroundLocationOk && _notificationOk && _batteryOk && _gpsOk;

  Future<void> _refreshStatus() async {
    setState(() => _checking = true);

    final gpsEnabled = await Geolocator.isLocationServiceEnabled();
    final locationStatus = await Permission.locationWhenInUse.status;
    final backgroundStatus = await Permission.locationAlways.status;
    final notifStatus = await Permission.notification.status;
    final batteryStatus = await Permission.ignoreBatteryOptimizations.status;

    if (!mounted) return;
    setState(() {
      _gpsOk = gpsEnabled;
      _locationOk = locationStatus.isGranted;
      _backgroundLocationOk = backgroundStatus.isGranted;
      _notificationOk = notifStatus.isGranted;
      _batteryOk = batteryStatus.isGranted;
      _checking = false;
    });

    if (_allGranted && mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomeScreen()),
      );
    }
  }

  Future<void> _requestLocation() async {
    await Permission.locationWhenInUse.request();
    _refreshStatus();
  }

  Future<void> _requestBackgroundLocation() async {
    if (!_locationOk) {
      await _requestLocation();
      return;
    }
    await Permission.locationAlways.request();
    _refreshStatus();
  }

  Future<void> _requestNotification() async {
    await Permission.notification.request();
    _refreshStatus();
  }

  Future<void> _requestBattery() async {
    await Permission.ignoreBatteryOptimizations.request();
    _refreshStatus();
  }

  Future<void> _openGpsSettings() async {
    await Geolocator.openLocationSettings();
    _refreshStatus();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تفعيل الصلاحيات المطلوبة')),
      body: _checking
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                const Text(
                  'لضمان عدم اختفاء موقعك من شاشة المتابعة أثناء العمل، يجب تفعيل كل ما يلي:',
                  style: TextStyle(fontSize: 15, color: Colors.black87),
                ),
                const SizedBox(height: 20),
                _permissionTile(
                  title: 'خدمة تحديد الموقع (GPS)',
                  ok: _gpsOk,
                  onPressed: _openGpsSettings,
                ),
                _permissionTile(
                  title: 'صلاحية الموقع أثناء استخدام التطبيق',
                  ok: _locationOk,
                  onPressed: _requestLocation,
                ),
                _permissionTile(
                  title: 'صلاحية الموقع الدائم (طوال الوقت)',
                  subtitle: 'اختر "السماح طوال الوقت" في الشاشة التالية',
                  ok: _backgroundLocationOk,
                  onPressed: _requestBackgroundLocation,
                ),
                _permissionTile(
                  title: 'صلاحية الإشعارات',
                  ok: _notificationOk,
                  onPressed: _requestNotification,
                ),
                _permissionTile(
                  title: 'استثناء التطبيق من توفير البطارية',
                  subtitle: 'حتى لا يوقف النظام التتبع أثناء قفل الشاشة',
                  ok: _batteryOk,
                  onPressed: _requestBattery,
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _refreshStatus,
                  child: const Text('تحقق مرة أخرى'),
                ),
              ],
            ),
    );
  }

  Widget _permissionTile({
    required String title,
    String? subtitle,
    required bool ok,
    required VoidCallback onPressed,
  }) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: ListTile(
        leading: Icon(
          ok ? Icons.check_circle : Icons.cancel,
          color: ok ? Colors.green : Colors.red,
          size: 32,
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: subtitle != null ? Text(subtitle, style: const TextStyle(fontSize: 12)) : null,
        trailing: ok
            ? null
            : ElevatedButton(
                onPressed: onPressed,
                child: const Text('تفعيل'),
              ),
      ),
    );
  }
}
