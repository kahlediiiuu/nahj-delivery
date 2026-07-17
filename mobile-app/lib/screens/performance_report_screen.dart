import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/app_strings.dart';

class PerformanceReportScreen extends StatefulWidget {
  const PerformanceReportScreen({super.key});

  @override
  State<PerformanceReportScreen> createState() => _PerformanceReportScreenState();
}

class _PerformanceReportScreenState extends State<PerformanceReportScreen> {
  DateTime _selectedDate = DateTime.now().subtract(const Duration(days: 1));
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
        return const Color(0xFF16A34A);
      case 'yellow':
        return const Color(0xFFEAB308);
      case 'red':
        return const Color(0xFFDC2626);
      default:
        return Colors.blueGrey;
    }
  }

  IconData _iconFor(String? grade) {
    switch (grade) {
      case 'A':
        return Icons.emoji_events;
      case 'B':
        return Icons.star;
      case 'C':
        return Icons.thumb_up;
      case 'F':
        return Icons.warning_amber_rounded;
      default:
        return Icons.info;
    }
  }

  @override
  Widget build(BuildContext context) {
    final found = _data != null && _data!['found'] == true;
    final hidden = _data != null && _data!['hidden'] == true;
    final color = found ? _colorFor(_data!['categoryColor']) : Colors.grey;
    final grade = found ? _data!['grade']?.toString() : null;

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(title: Text(AppStrings.get('performanceReport'))),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _changeDay(-1)),
                  Text(_dateKey, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _changeDay(1)),
                ],
              ),
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))
            else if (_error != null)
              Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
            else if (hidden)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 40),
                child: Center(child: Text('التقارير غير متاحة حاليًا لحسابك', style: TextStyle(color: Colors.grey.shade600))),
              )
            else if (!found)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 40),
                child: Center(
                  child: Text(AppStrings.get('noPerformanceData'), style: const TextStyle(color: Colors.grey, fontSize: 15)),
                ),
              )
            else ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [color.withOpacity(0.9), color.withOpacity(0.6)]),
                  borderRadius: BorderRadius.circular(22),
                  boxShadow: [BoxShadow(color: color.withOpacity(0.3), blurRadius: 16, offset: const Offset(0, 8))],
                ),
                child: Column(
                  children: [
                    Icon(_iconFor(grade), size: 52, color: Colors.white),
                    const SizedBox(height: 10),
                    Text(
                      _data!['categoryLabel']?.toString().isNotEmpty == true
                          ? _data!['categoryLabel']
                          : AppStrings.get('category'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                    if (_data!['city'] != null && _data!['city'].toString().isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text('📍 ${_data!['city']}', style: const TextStyle(color: Colors.white70, fontSize: 13)),
                    ],
                  ],
                ),
              ),

              const SizedBox(height: 20),

              if (_data!['finalQualityScore'] != null && (_data!['finalQualityScore'] as num) > 0)
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 70, height: 70,
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            CircularProgressIndicator(
                              value: (_data!['finalQualityScore'] as num).toDouble().clamp(0, 1),
                              strokeWidth: 7,
                              backgroundColor: Colors.grey.shade200,
                              color: color,
                            ),
                            Text('${(((_data!['finalQualityScore'] as num) * 100)).toStringAsFixed(0)}%',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                          ],
                        ),
                      ),
                      const SizedBox(width: 16),
                      const Expanded(
                        child: Text('درجة الجودة النهائية', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      ),
                    ],
                  ),
                ),

              const SizedBox(height: 16),

              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.5,
                children: [
                  _statCard('📦', '${_data!['completedOrders'] ?? 0}/${_data!['grossOrders'] ?? 0}', 'طلبات منجزة', Colors.green),
                  _statCard('❌', '${_data!['failedOrders'] ?? 0}', 'طلبات فاشلة', Colors.red),
                  _statCard('⏱️', '${_data!['onTimeDeliveryScore'] ?? 0}%', 'الالتزام بالوقت', Colors.blue),
                  _statCard('✅', '${_data!['verificationSuccessRate'] ?? 0}%', 'نجاح التحقق', Colors.indigo),
                ],
              ),

              if (_data!['notes'] != null && _data!['notes'].toString().isNotEmpty) ...[
                const SizedBox(height: 16),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('📝 ملاحظة الإدارة', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 6),
                      Text(_data!['notes']),
                    ],
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _statCard(String emoji, String value, String label, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Row(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 22)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(value, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: color)),
                Text(label, style: TextStyle(fontSize: 10, color: Colors.grey.shade600)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
