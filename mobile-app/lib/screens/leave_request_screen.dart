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

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _loadHistory() async {
    try {
      final result = await ApiService.getMyLeaveRequests();
      if (result['success'] == true) {
        setState(() => _history = result['requests'] ?? []);
      }
    } catch (_) {}
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

  void _openHistorySheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        builder: (ctx, scrollController) => Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(AppStrings.get('myLeaveRequests'), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 10),
              Expanded(
                child: _history.isEmpty
                    ? const Center(child: Text('لا توجد طلبات سابقة', style: TextStyle(color: Colors.grey)))
                    : ListView.builder(
                        controller: scrollController,
                        itemCount: _history.length,
                        itemBuilder: (ctx, i) {
                          final r = _history[i];
                          return Card(
                            child: ListTile(
                              title: Text(r['date'] ?? ''),
                              subtitle: Text(r['note']?.toString().isNotEmpty == true ? r['note'] : ''),
                              trailing: Text(
                                _statusLabel(r['status'] ?? 'pending'),
                                style: TextStyle(color: _statusColor(r['status'] ?? 'pending'), fontWeight: FontWeight.bold, fontSize: 12),
                              ),
                              onTap: () => _openConversation(r),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _openConversation(Map request) {
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        child: _LeaveConversationView(request: request, statusLabel: _statusLabel, statusColor: _statusColor),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(AppStrings.get('requestLeave')),
        actions: [
          IconButton(icon: const Icon(Icons.history), tooltip: 'طلباتي السابقة', onPressed: _openHistorySheet),
        ],
      ),
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
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: _openHistorySheet,
            icon: const Icon(Icons.list_alt),
            label: Text('${AppStrings.get('myLeaveRequests')} (${_history.length})'),
          ),
        ],
      ),
    );
  }
}

class _LeaveConversationView extends StatefulWidget {
  final Map request;
  final String Function(String) statusLabel;
  final Color Function(String) statusColor;
  const _LeaveConversationView({required this.request, required this.statusLabel, required this.statusColor});

  @override
  State<_LeaveConversationView> createState() => _LeaveConversationViewState();
}

class _LeaveConversationViewState extends State<_LeaveConversationView> {
  List<dynamic> _notes = [];
  bool _loading = true;
  final _controller = TextEditingController();
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final result = await ApiService.getLeaveNotes(widget.request['id']);
      if (result['success'] == true) setState(() => _notes = result['notes'] ?? []);
    } catch (_) {}
    setState(() => _loading = false);
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      final result = await ApiService.sendLeaveNote(widget.request['id'], text);
      if (result['success'] == true) {
        _controller.clear();
        _load();
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.request;
    return SizedBox(
      width: double.maxFinite,
      height: 500,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('طلب إجازة ${r['date']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                Text(widget.statusLabel(r['status'] ?? 'pending'), style: TextStyle(color: widget.statusColor(r['status'] ?? 'pending'), fontWeight: FontWeight.bold)),
              ],
            ),
            const Divider(),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _notes.isEmpty
                      ? const Center(child: Text('لا توجد ملاحظات بعد', style: TextStyle(color: Colors.grey)))
                      : ListView.builder(
                          itemCount: _notes.length,
                          itemBuilder: (ctx, i) {
                            final n = _notes[i];
                            final isMe = n['sender'] == 'driver';
                            return Align(
                              alignment: isMe ? Alignment.centerLeft : Alignment.centerRight,
                              child: Container(
                                margin: const EdgeInsets.symmetric(vertical: 4),
                                padding: const EdgeInsets.all(10),
                                constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.6),
                                decoration: BoxDecoration(
                                  color: isMe ? Colors.blue[50] : const Color(0xFF0F172A),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(n['text'] ?? '', style: TextStyle(color: isMe ? Colors.black87 : Colors.white)),
                              ),
                            );
                          },
                        ),
            ),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    decoration: const InputDecoration(hintText: 'اكتب ردك هنا...', isDense: true, border: OutlineInputBorder()),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _sending ? null : _send,
                  icon: _sending ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
