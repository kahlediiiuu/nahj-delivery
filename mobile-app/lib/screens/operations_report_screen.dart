import 'package:flutter/material.dart';
import '../services/api_service.dart';

class OperationsReportScreen extends StatefulWidget {
  const OperationsReportScreen({super.key});

  @override
  State<OperationsReportScreen> createState() => _OperationsReportScreenState();
}

class _OperationsReportScreenState extends State<OperationsReportScreen> {
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
      final result = await ApiService.getMyOperationsReport(date: _dateKey);
      if (result['success'] == true) {
        setState(() => _data = result);
      } else {
        setState(() => _error = result['message'] ?? 'تعذّر تحميل التقرير');
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

  @override
  Widget build(BuildContext context) {
    final found = _data != null && _data!['found'] == true;
    final hidden = _data != null && _data!['hidden'] == true;

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(title: const Text('📈 تقرير التشغيل')),
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
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: Text('لا يوجد تقرير تشغيل لهذا اليوم بعد', style: TextStyle(color: Colors.grey, fontSize: 15))),
              )
            else ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFF0F172A), Color(0xFF1E293B)]),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  children: [
                    const Text('⏱️ ساعات العمل الفعلية', style: TextStyle(color: Colors.white70, fontSize: 13)),
                    const SizedBox(height: 8),
                    Text('${_data!['actualWorkingHours'] ?? 0}', style: const TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text('من أصل ${_data!['plannedWorkingHours'] ?? 0} ساعة محجوزة', style: const TextStyle(color: Colors.white54, fontSize: 12)),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              const Text('الحضور والالتزام', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              const SizedBox(height: 10),
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.5,
                children: [
                  _statCard('✅', '${_data!['attendanceRate'] ?? 0}%', 'نسبة الحضور', Colors.green),
                  _statCard('🚫', '${_data!['noShows'] ?? 0}', 'مرات الغياب', Colors.red),
                  _statCard('☕', '${_data!['breakHours'] ?? 0}', 'ساعات الاستراحة', Colors.orange),
                  _statCard('📅', '${_data!['workingDays'] ?? 0}', 'أيام العمل', Colors.blue),
                ],
              ),

              const SizedBox(height: 20),
              const Text('الطلبات', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              const SizedBox(height: 10),
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.5,
                children: [
                  _statCard('👍', '${_data!['acceptanceRate'] ?? 0}%', 'نسبة القبول', Colors.indigo),
                  _statCard('📦', '${_data!['completedDeliveries'] ?? 0}', 'طلبات مكتملة', Colors.teal),
                  _statCard('✅', '${_data!['acceptedDeliveries'] ?? 0}', 'طلبات مقبولة', Colors.green),
                  _statCard('❌', '${_data!['declinedDeliveries'] ?? 0}', 'طلبات مرفوضة', Colors.red),
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
