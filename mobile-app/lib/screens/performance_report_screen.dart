import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/app_strings.dart';

class PerformanceReportScreen extends StatefulWidget {
  const PerformanceReportScreen({super.key});

  @override
  State<PerformanceReportScreen> createState() => _PerformanceReportScreenState();
}

class _PerformanceReportScreenState extends State<PerformanceReportScreen> {
  DateTime _selectedDate = DateTime.now();
  bool _loading = true;
  Map<String, dynamic>? _data;
  String? _error;

  String get _dateKey =>
      '${_selectedDate.year.toString().padLeft(4, '0')}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final result = await ApiService.getMyPerformance(date: _dateKey);
      if (result['success'] == true) {
        setState(() => _data = result);
      } else {
        setState(() => _error = result['message'] ?? AppStrings.get('connectionError'));
      }
    } catch (e) {
      setState(() => _error = 'خطأ: $e');
    } finally {
      setState(() => _loading = false);
    }
  }

  void _changeDay(int delta) {
    setState(() => _selectedDate = _selectedDate.add(Duration(days: delta)));
    _load();
  }

  Color _colorFor(String? colorKey) {
    switch (colorKey) {
      case 'green':
        return Colors.green;
      case 'yellow':
        return Colors.orange;
      case 'red':
        return Colors.red;
      default:
        return Colors.blueGrey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final found = _data != null && _data!['found'] == true;
    final color = found ? _colorFor(_data!['categoryColor']) : Colors.grey;

    return Scaffold(
      appBar: AppBar(title: Text(AppStrings.get('performanceReport'))),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // شريط التنقل بين الأيام
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _changeDay(-1)),
                Text(_dateKey, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _changeDay(1)),
              ],
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))
            else if (_error != null)
              Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
            else if (!found)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 40),
                child: Center(
                  child: Text(AppStrings.get('noPerformanceData'), style: const TextStyle(color: Colors.grey, fontSize: 15)),
                ),
              )
            else ...[
              // بطاقة الفئة الملوّنة الكبيرة
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: color, width: 2),
                ),
                child: Column(
                  children: [
                    Icon(
                      color == Colors.green ? Icons.star : (color == Colors.red ? Icons.warning : Icons.info),
                      size: 48,
                      color: color,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _data!['categoryLabel']?.toString().isNotEmpty == true
                          ? _data!['categoryLabel']
                          : AppStrings.get('category'),
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: color),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              _statRow(AppStrings.get('ordersAccepted'), '${_data!['ordersAccepted'] ?? 0}', Icons.check_circle, Colors.green),
              _statRow(AppStrings.get('ordersRejected'), '${_data!['ordersRejected'] ?? 0}', Icons.cancel, Colors.red),
              _statRow(AppStrings.get('verificationCount'), '${_data!['verificationCount'] ?? 0}', Icons.verified, Colors.blue),
              if (_data!['notes'] != null && _data!['notes'].toString().isNotEmpty) ...[
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_data!['notes']),
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _statRow(String label, String value, IconData icon, Color color) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: ListTile(
        leading: Icon(icon, color: color, size: 32),
        title: Text(label),
        trailing: Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
      ),
    );
  }
}
