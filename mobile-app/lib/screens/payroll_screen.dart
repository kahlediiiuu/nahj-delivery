import 'package:flutter/material.dart';
import '../services/api_service.dart';

class PayrollScreen extends StatefulWidget {
  const PayrollScreen({super.key});

  @override
  State<PayrollScreen> createState() => _PayrollScreenState();
}

class _PayrollScreenState extends State<PayrollScreen> {
  DateTime _selectedMonth = DateTime.now();
  bool _loading = true;
  Map<String, dynamic>? _data;
  List<dynamic> _advances = [];

  String get _monthKey => '${_selectedMonth.year}-${_selectedMonth.month.toString().padLeft(2, '0')}';

  @override
  void initState() {
    super.initState();
    _load();
    _loadAdvances();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final result = await ApiService.getMyPayroll(month: _monthKey);
      if (result['success'] == true) setState(() => _data = result);
    } catch (_) {}
    setState(() => _loading = false);
  }

  Future<void> _loadAdvances() async {
    try {
      final result = await ApiService.getMyAdvanceRequests();
      if (result['success'] == true) setState(() => _advances = result['requests'] ?? []);
    } catch (_) {}
  }

  void _changeMonth(int delta) {
    setState(() => _selectedMonth = DateTime(_selectedMonth.year, _selectedMonth.month + delta));
    _load();
  }

  void _openAdvanceDialog() {
    final amountController = TextEditingController();
    final reasonController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('💵 طلب سلفة'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: amountController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'المبلغ المطلوب (ريال)'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: reasonController,
              decoration: const InputDecoration(labelText: 'السبب (اختياري)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          ElevatedButton(
            onPressed: () async {
              final amount = double.tryParse(amountController.text.trim());
              if (amount == null || amount <= 0) return;
              Navigator.pop(ctx);
              final result = await ApiService.submitAdvanceRequest(amount, reasonController.text.trim());
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(result['success'] == true ? '✅ تم إرسال طلبك، بانتظار موافقة الإدارة' : '❌ ${result['message'] ?? 'فشل الإرسال'}'),
                    backgroundColor: result['success'] == true ? Colors.green : Colors.red,
                  ),
                );
              }
              _loadAdvances();
            },
            child: const Text('إرسال الطلب'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final found = _data != null && _data!['found'] == true;
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(title: const Text('💰 مستحقاتي')),
      body: RefreshIndicator(
        onRefresh: () async { await _load(); await _loadAdvances(); },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _changeMonth(-1)),
                  Text(_monthKey, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _changeMonth(1)),
                ],
              ),
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))
            else if (!found)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: Text('لا توجد بيانات مستحقات لهذا الشهر بعد', style: TextStyle(color: Colors.grey, fontSize: 15))),
              )
            else ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFF16A34A), Color(0xFF15803D)]),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  children: [
                    const Text('الصافي المستحق هذا الشهر', style: TextStyle(color: Colors.white70, fontSize: 13)),
                    const SizedBox(height: 8),
                    Text('${_data!['totalAfterDeductions']?.toStringAsFixed(2) ?? 0} ريال', style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _detailCard('📦 قيمة الطلبات', '${_data!['totalDeliveryValue']?.toStringAsFixed(2) ?? 0} ريال', 'عدد الطلبات: ${_data!['totalOrders'] ?? 0}'),
              _detailCard('🛣️ قيمة المسافات الإضافية', '${_data!['distanceValue']?.toStringAsFixed(2) ?? 0} ريال', 'إجمالي المسافة: ${_data!['totalDistanceKm'] ?? 0} كم'),
              _detailCard('🏆 مكافأة التقييم', '${_data!['ratingBonusTotal']?.toStringAsFixed(2) ?? 0} ريال', 'الفئة: ${_data!['grade'] ?? '--'} (${_data!['ratingBonusPerOrder'] ?? 0} ريال/طلب)'),
              _detailCard('➕ الإجمالي قبل الخصومات', '${_data!['totalBeforeDeductions']?.toStringAsFixed(2) ?? 0} ريال', ''),

              if (_data!['deductions'] != null && (_data!['deductions'] as List).isNotEmpty) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: Colors.red.withOpacity(0.06), borderRadius: BorderRadius.circular(14)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('➖ تفاصيل الخصومات', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.red)),
                      const SizedBox(height: 8),
                      ...List<Map>.from(_data!['deductions']).map((d) => Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(d['label']?.toString() ?? '', style: const TextStyle(fontSize: 13)),
                                Text('-${d['amount']} ريال', style: const TextStyle(fontSize: 13, color: Colors.red)),
                              ],
                            ),
                          )),
                    ],
                  ),
                ),
              ],

              if (_data!['notes'] != null && _data!['notes'].toString().isNotEmpty) ...[
                const SizedBox(height: 12),
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

            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _openAdvanceDialog,
                icon: const Icon(Icons.attach_money),
                label: const Text('طلب سلفة'),
                style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
              ),
            ),

            if (_advances.isNotEmpty) ...[
              const SizedBox(height: 20),
              const Text('طلبات السلف السابقة', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              const SizedBox(height: 10),
              ..._advances.map((r) {
                final statusLabel = {'pending': '⏳ قيد المراجعة', 'approved': '✅ مقبولة', 'rejected': '❌ مرفوضة'}[r['status']] ?? '';
                return Card(
                  child: ListTile(
                    title: Text('${r['amount']} ريال'),
                    subtitle: Text(r['reason']?.toString().isNotEmpty == true ? r['reason'] : ''),
                    trailing: Text(statusLabel),
                  ),
                );
              }),
            ],
          ],
        ),
      ),
    );
  }

  Widget _detailCard(String title, String value, String subtitle) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontSize: 13, color: Colors.grey)),
              if (subtitle.isNotEmpty) Text(subtitle, style: const TextStyle(fontSize: 11, color: Colors.grey)),
            ],
          ),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
        ],
      ),
    );
  }
}
