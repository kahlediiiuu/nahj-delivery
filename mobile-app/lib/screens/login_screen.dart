import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../services/api_service.dart';
import '../services/app_strings.dart';
import 'home_screen.dart';
import 'permission_gate_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _codeController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _changeLanguage(String lang) async {
    await AppStrings.setLanguage(lang);
    setState(() {});
  }

  Future<void> _handleLogin() async {
    setState(() { _loading = true; _error = null; });

    // التأكد من تفعيل GPS ومنح الصلاحيات قبل السماح بالدخول
    final gpsEnabled = await Geolocator.isLocationServiceEnabled();
    if (!gpsEnabled) {
      setState(() {
        _loading = false;
        _error = AppStrings.get('gpsRequired');
      });
      return;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.deniedForever || permission == LocationPermission.denied) {
      setState(() {
        _loading = false;
        _error = AppStrings.get('permissionRequired');
      });
      return;
    }

    try {
      final result = await ApiService.login(_codeController.text.trim(), _passwordController.text);
      if (result['success'] == true) {
        await ApiService.saveSession(result['token'], result['driver']);
        if (!mounted) return;
        Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const PermissionGateScreen()));
      } else {
        setState(() => _error = result['message'] ?? AppStrings.get('loginError'));
      }
    } catch (e) {
      setState(() => _error = '${AppStrings.get('connectionError')}\n[تفاصيل تقنية: $e]');
    } finally {
      setState(() => _loading = false);
    }
  }

  Widget _langButton(String code, String label) {
    final selected = AppStrings.currentLang == code;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: OutlinedButton(
        onPressed: () => _changeLanguage(code),
        style: OutlinedButton.styleFrom(
          backgroundColor: selected ? Colors.white : Colors.transparent,
          foregroundColor: selected ? const Color(0xFF0F172A) : Colors.white,
          side: const BorderSide(color: Colors.white),
        ),
        child: Text(label),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.local_shipping, size: 64, color: Colors.white),
              const SizedBox(height: 12),
              Text(AppStrings.get('appTitle'), style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.bold)),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _langButton('ar', 'العربية'),
                  _langButton('en', 'English'),
                  _langButton('bn', 'বাংলা'),
                ],
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
                child: Column(
                  children: [
                    TextField(
                      controller: _codeController,
                      decoration: InputDecoration(labelText: AppStrings.get('driverCode'), border: const OutlineInputBorder()),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _passwordController,
                      obscureText: true,
                      decoration: InputDecoration(labelText: AppStrings.get('password'), border: const OutlineInputBorder()),
                    ),
                    const SizedBox(height: 20),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(_error!, style: const TextStyle(color: Colors.red)),
                      ),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _loading ? null : _handleLogin,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0F172A),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                        child: _loading
                            ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                            : Text(AppStrings.get('login'), style: const TextStyle(color: Colors.white)),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

