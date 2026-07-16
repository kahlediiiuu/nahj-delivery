import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/app_strings.dart';

class MyReportScreen extends StatefulWidget {
  const MyReportScreen({super.key});

  @override
  State<MyReportScreen> createState() => _MyReportScreenState();
}

class _MyReportScreenState extends State<MyReportScreen> {
  bool _loading = true;
  Map<String, dynamic>? _report;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final result = await ApiService.getMyReport();
      if (result['success'] == true) {
        setState(() => _report = result);
      } else {
        setState(() => _error = result['message'] ?? AppStrings.get('connectionError'));
      }
    } catch (e) {
      setState(() => _error = 'خطأ: $e');
    } finally {
      setState(() => _loading = false);
    }
  }

  Widget _statCard(String label, String value, IconData icon, Color color) {
    return Card(
      elevation: 2,
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(icon, size: 36, color: color),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 13, color: Colors.grey)),
                  const SizedBox(height: 4),
                  Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(AppStrings.get('myDailyReport'))),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 20),
                      child: Text(_error!, style: const TextStyle(color: Colors.red), textAlign: TextAlign.center),
                    )
                  else if (_report != null) ...[
                    if (!(_report!['onShift'] == true) && (_report!['hoursWorked'] ?? 0) == 0)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Text(
                          AppStrings.get('noReportYet'),
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.grey),
                        ),
                      ),
                    _statCard(
                      AppStrings.get('hoursWorked'),
                      '${_report!['hoursWorked']} ${AppStrings.currentLang == 'ar' ? 'ساعة' : (AppStrings.currentLang == 'bn' ? 'ঘন্টা' : 'hrs')}',
                      Icons.access_time,
                      Colors.blue,
                    ),
                    _statCard(
                      AppStrings.get('distanceCovered'),
                      '${_report!['distanceKm']} ${AppStrings.currentLang == 'ar' ? 'كم' : 'km'}',
                      Icons.route,
                      Colors.green,
                    ),
                    _statCard(
                      AppStrings.get('todayRating'),
                      _report!['rating'] ?? '--',
                      Icons.star,
                      Colors.orange,
                    ),
                  ],
                ],
              ),
      ),
    );
  }
}
