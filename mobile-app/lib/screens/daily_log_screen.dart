import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/app_strings.dart';

class DailyLogScreen extends StatefulWidget {
  const DailyLogScreen({super.key});

  @override
  State<DailyLogScreen> createState() => _DailyLogScreenState();
}

class _DailyLogScreenState extends State<DailyLogScreen> {
  DateTime _selectedDate = DateTime.now();
  bool _loading = true;
  List<dynamic> _orders = [];
  Map<String, dynamic> _summary = {'total': 0, 'completed': 0, 'failed': 0};
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
      final result = await ApiService.getOrdersForDay(_dateKey);
      if (result['success'] == true) {
        setState(() {
          _orders = result['orders'] ?? [];
          _summary = result['summary'] ?? {'total': 0, 'completed': 0, 'failed': 0};
        });
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

  Future<void> _deleteEntry(String id) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(AppStrings.get('deleteConfirm')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(AppStrings.get('cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حذف', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirm == true) {
      final ok = await ApiService.deleteOrder(id);
      if (!ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('❌ فشل حذف السجل'), backgroundColor: Colors.red),
        );
      }
      _load();
    }
  }

  void _openAddDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => const _AddDeliverySheet(),
    ).then((added) {
      if (added == true) _load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(AppStrings.get('dailyLog'))),
      body: Column(
        children: [
          // شريط التنقل بين الأيام
          Container(
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _changeDay(-1)),
                Text(_dateKey, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _changeDay(1)),
              ],
            ),
          ),
          // ملخص اليوم
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(child: _summaryCard(AppStrings.get('total'), '${_summary['total']}', Colors.blueGrey)),
                const SizedBox(width: 8),
                Expanded(child: _summaryCard(AppStrings.get('completed'), '${_summary['completed']}', Colors.green)),
                const SizedBox(width: 8),
                Expanded(child: _summaryCard(AppStrings.get('failed'), '${_summary['failed']}', Colors.red)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
                    : _orders.isEmpty
                        ? Center(child: Text(AppStrings.get('noDeliveriesToday'), style: const TextStyle(color: Colors.grey)))
                        : ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            itemCount: _orders.length,
                            itemBuilder: (ctx, i) {
                              final o = _orders[i];
                              final isCompleted = o['status'] == 'completed';
                              return Card(
                                child: ListTile(
                                  leading: Icon(
                                    isCompleted ? Icons.check_circle : Icons.cancel,
                                    color: isCompleted ? Colors.green : Colors.red,
                                  ),
                                  title: Text(isCompleted ? AppStrings.get('deliverySucceeded') : AppStrings.get('deliveryFailed')),
                                  subtitle: Text(
                                    isCompleted
                                        ? (o['verificationMethod'] ?? '')
                                        : (o['failureReason'] ?? ''),
                                  ),
                                  trailing: IconButton(
                                    icon: const Icon(Icons.delete_outline, color: Colors.grey),
                                    onPressed: () => _deleteEntry(o['id']),
                                  ),
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openAddDialog,
        label: Text(AppStrings.get('addDelivery')),
        icon: const Icon(Icons.add),
      ),
    );
  }

  Widget _summaryCard(String label, String value, Color color) {
    return Card(
      color: color.withOpacity(0.1),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(
          children: [
            Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
            Text(label, style: const TextStyle(fontSize: 11)),
          ],
        ),
      ),
    );
  }
}

class _AddDeliverySheet extends StatefulWidget {
  const _AddDeliverySheet();

  @override
  State<_AddDeliverySheet> createState() => _AddDeliverySheetState();
}

class _AddDeliverySheetState extends State<_AddDeliverySheet> {
  bool _success = true;
  String? _failureReason;
  String? _verificationMethod;
  bool _saving = false;
  String? _submitError;

  final List<String> _reasonKeys = ['reasonCustomerAbsent', 'reasonRefused', 'reasonWrongAddress', 'reasonOther'];
  final List<String> _verifyKeys = ['verifySignature', 'verifyOtp', 'verifyPhoto'];

  Future<void> _submit() async {
    if (!_success && _failureReason == null) {
      setState(() => _submitError = 'اختر سبب الفشل أولاً');
      return;
    }
    setState(() { _saving = true; _submitError = null; });
    try {
      final result = await ApiService.addOrder(
        status: _success ? 'completed' : 'failed',
        failureReason: _failureReason,
        verificationMethod: _verificationMethod,
      );
      if (result['success'] == true) {
        if (mounted) Navigator.pop(context, true);
      } else {
        setState(() => _submitError = result['message'] ?? 'فشل الحفظ، حاول مجددًا');
      }
    } catch (_) {
      // هذا يمنع تعليق الزر للأبد عند انقطاع الاتصال - يظهر خطأ واضح بدل التعليق الصامت
      setState(() => _submitError = 'تعذّر الاتصال بالخادم، تحقق من الإنترنت وحاول مجددًا');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20, right: 20, top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(AppStrings.get('addDelivery'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: ChoiceChip(
                  label: Text(AppStrings.get('deliverySucceeded')),
                  selected: _success,
                  onSelected: (v) => setState(() => _success = true),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ChoiceChip(
                  label: Text(AppStrings.get('deliveryFailed')),
                  selected: !_success,
                  onSelected: (v) => setState(() => _success = false),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (_success) ...[
            Text(AppStrings.get('verificationMethod')),
            Wrap(
              spacing: 8,
              children: _verifyKeys.map((k) => ChoiceChip(
                label: Text(AppStrings.get(k)),
                selected: _verificationMethod == AppStrings.get(k),
                onSelected: (v) => setState(() => _verificationMethod = AppStrings.get(k)),
              )).toList(),
            ),
          ] else ...[
            Text(AppStrings.get('failureReason')),
            Wrap(
              spacing: 8,
              children: _reasonKeys.map((k) => ChoiceChip(
                label: Text(AppStrings.get(k)),
                selected: _failureReason == AppStrings.get(k),
                onSelected: (v) => setState(() => _failureReason = AppStrings.get(k)),
              )).toList(),
            ),
          ],
          if (_submitError != null) ...[
            const SizedBox(height: 12),
            Text(_submitError!, style: const TextStyle(color: Colors.red, fontSize: 13)),
          ],
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _saving ? null : _submit,
            child: _saving ? const CircularProgressIndicator() : Text(AppStrings.get('save')),
          ),
        ],
      ),
    );
  }
}
