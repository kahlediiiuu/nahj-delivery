import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/app_strings.dart';

class LeaveRequestScreen extends StatefulWidget {
  const LeaveRequestScreen({super.key});

  @override
  State<LeaveRequestScreen> createState() => _LeaveRequestScreenState();
}

class _LeaveRequestScreenState extends State<LeaveRequestScreen> {
  String _reasonType = 'sick';
  DateTime _date = DateTime.now().add(const Duration(days: 1));
  final _noteController = TextEditingController();
  bool _sending = false;
  List<dynamic> _history = [];
  bool _loadingHistory = true;

  final _reasons = [
    {'value': 'sick', 'key': 'leaveReasonSick'},
    {'value': 'emergency', 'key': 'leaveReasonEmergency'},
    {'value': 'personal', 'key': 'leaveReasonPersonal'},
    {'value': 'other', 'key': 'leaveReasonOther'},
  ];

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    setState(() => _loadingHistory = true);
    try {
      final result = await ApiService.getMyLeaveRequests();
      if (result['success'] == true) {
        setState(() => _history = result['requests'] ?? []);
      }
    } catch (_) {}
    setState(() => _loadingHistory = false);
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _submit() async {
    setState(() => _sending = true);
    try {
      final dateStr =
          '${_date.year.toString().padLeft(4, '0')}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}';
      final result = await ApiService.submitLeaveRequest(
        reasonType: _reasonType,
        date: dateStr,
        note: _noteController.text.trim(),
      );
      if (result['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(AppStrings.get('leaveRequestSent')), backgroundColor: Colors.green),
          );
          _noteController.clear();
          _loadHistory();
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(result['message'] ?? 'حدث خطأ'), backgroundColor: Colors.red),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('خطأ: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'approved':
        return Colors.green;
      case 'rejected':
        return Colors.red;
      default:
        return Colors.orange;
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'approved':
        return AppStrings.get('leaveStatusApproved');
      case 'rejected':
        return AppStrings.get('leaveStatusRejected');
      default:
        return AppStrings.get('leaveStatusPending');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(AppStrings.get('requestLeave'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(AppStrings.get('leaveReason'), style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: _reasons.map((r) {
                      final selected = _reasonType == r['value'];
                      return ChoiceChip(
                        label: Text(AppStrings.get(r['key']!)),
                        selected: selected,
                        onSelected: (_) => setState(() => _reasonType = r['value']!),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 20),
                  Text(AppStrings.get('leaveDate'), style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _pickDate,
                    icon: const Icon(Icons.calendar_today),
                    label: Text(
                        '${_date.year}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}'),
                  ),
                  const SizedBox(height: 20),
                  Text(AppStrings.get('leaveNote'), style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _noteController,
                    maxLines: 3,
                    decoration: const InputDecoration(border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _sending ? null : _submit,
                      style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                      child: _sending
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(AppStrings.get('submitLeaveRequest')),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(AppStrings.get('myLeaveRequests'), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 8),
          if (_loadingHistory)
            const Center(child: CircularProgressIndicator())
          else if (_history.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Center(child: Text('لا توجد طلبات سابقة', style: TextStyle(color: Colors.grey))),
            )
          else
            ..._history.map((r) => Card(
                  child: ListTile(
                    title: Text(r['date'] ?? ''),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(r['note'] ?? ''),
                        if (r['adminNote'] != null && r['adminNote'].toString().isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text('📝 ملاحظة الإدارة: ${r['adminNote']}', style: const TextStyle(color: Colors.blue, fontSize: 12)),
                          ),
                      ],
                    ),
                    trailing: Text(
                      _statusLabel(r['status'] ?? 'pending'),
                      style: TextStyle(color: _statusColor(r['status'] ?? 'pending'), fontWeight: FontWeight.bold),
                    ),
                  ),
                )),
        ],
      ),
    );
  }
}
