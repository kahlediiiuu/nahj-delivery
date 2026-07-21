import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../services/api_service.dart';

class DailyNotesScreen extends StatefulWidget {
  const DailyNotesScreen({super.key});

  @override
  State<DailyNotesScreen> createState() => _DailyNotesScreenState();
}

class _DailyNotesScreenState extends State<DailyNotesScreen> {
  final _noteController = TextEditingController();
  String? _selectedType;
  String? _pickedImageBase64;
  String? _pickedImageName;
  bool _sending = false;
  bool _uploading = false;
  List<dynamic> _history = [];
  bool _loadingHistory = true;

  final _types = [
    {'value': 'restaurant_closed', 'label': '🔒 المطعم مغلق'},
    {'value': 'customer_no_response', 'label': '📵 العميل لا يرد'},
    {'value': 'accident', 'label': '🚨 حادث'},
    {'value': 'malfunction', 'label': '🔧 عطل'},
    {'value': 'app_issue', 'label': '📱 مشكلة بالتطبيق'},
    {'value': 'other', 'label': '📝 أخرى'},
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
    setState(() => _loadingHistory = true);
    try {
      final result = await ApiService.getMyDailyNotes();
      if (result['success'] == true) {
        setState(() => _history = result['notes'] ?? []);
      }
    } catch (_) {}
    setState(() => _loadingHistory = false);
  }

  Future<void> _pickImage() async {
    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(source: ImageSource.gallery, imageQuality: 50, maxWidth: 1280);
      if (picked == null) return;

      setState(() => _uploading = true);
      final bytes = await File(picked.path).readAsBytes();
      if (bytes.length > 700 * 1024) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('حجم الصورة كبير جدًا حتى بعد الضغط، جرّب صورة أخرى'), backgroundColor: Colors.red),
          );
        }
        return;
      }
      setState(() {
        _pickedImageBase64 = base64Encode(bytes);
        _pickedImageName = picked.name;
      });
    } catch (_) {
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _submit() async {
    if (_selectedType == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('اختر نوع الملاحظة أولًا'), backgroundColor: Colors.red),
      );
      return;
    }
    setState(() => _sending = true);
    try {
      final result = await ApiService.submitDailyNote(
        type: _selectedType!,
        note: _noteController.text.trim(),
        attachmentData: _pickedImageBase64,
        attachmentType: _pickedImageBase64 != null ? 'image/jpeg' : null,
      );
      if (result['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('تم إرسال ملاحظتك للإدارة بنجاح'), backgroundColor: Colors.green),
          );
        }
        setState(() {
          _selectedType = null;
          _pickedImageBase64 = null;
          _pickedImageName = null;
        });
        _noteController.clear();
        _loadHistory();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result['message'] ?? 'حدث خطأ'), backgroundColor: Colors.red),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تعذّر الاتصال بالخادم'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  String _labelFor(String type) {
    return _types.firstWhere((t) => t['value'] == type, orElse: () => {'label': type})['label']!;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(title: const Text('📝 ملاحظة يومية')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('نوع الملاحظة', style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _types.map((t) {
                      final selected = _selectedType == t['value'];
                      return ChoiceChip(
                        label: Text(t['label']!),
                        selected: selected,
                        onSelected: (_) => setState(() => _selectedType = t['value']),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 20),
                  const Text('تفاصيل إضافية (اختياري)', style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _noteController,
                    maxLines: 3,
                    decoration: const InputDecoration(border: OutlineInputBorder(), hintText: 'اكتب التفاصيل هنا...'),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _sending ? null : _submit,
                      style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                      child: _sending
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('إرسال للإدارة'),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          const Text('ملاحظاتي السابقة', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          const SizedBox(height: 10),
          if (_loadingHistory)
            const Center(child: CircularProgressIndicator())
          else if (_history.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Center(child: Text('لا توجد ملاحظات سابقة', style: TextStyle(color: Colors.grey))),
            )
          else
            ..._history.map((n) => _NoteHistoryCard(note: n, labelFor: _labelFor)),
        ],
      ),
    );
  }
}

class _NoteHistoryCard extends StatefulWidget {
  final Map note;
  final String Function(String) labelFor;
  const _NoteHistoryCard({required this.note, required this.labelFor});

  @override
  State<_NoteHistoryCard> createState() => _NoteHistoryCardState();
}

class _NoteHistoryCardState extends State<_NoteHistoryCard> {
  bool _showReplyBox = false;
  final _replyController = TextEditingController();
  bool _sending = false;
  String? _driverReply;

  @override
  void initState() {
    super.initState();
    _driverReply = widget.note['driverReply'];
  }

  @override
  void dispose() {
    _replyController.dispose();
    super.dispose();
  }

  Future<void> _sendReply() async {
    final text = _replyController.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      final result = await ApiService.replyToDailyNote(widget.note['id'], text);
      if (result['success'] == true) {
        setState(() {
          _driverReply = text;
          _showReplyBox = false;
        });
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.note;
    final time = DateTime.fromMillisecondsSinceEpoch(n['createdAt']);
    final timeStr = '${time.year}-${time.month.toString().padLeft(2, '0')}-${time.day.toString().padLeft(2, '0')} ${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(widget.labelFor(n['type']), style: const TextStyle(fontWeight: FontWeight.bold)),
                ),
                if (n['attachmentData'] != null) const Icon(Icons.image, color: Colors.blue, size: 18),
              ],
            ),
            Text(n['note']?.toString().isNotEmpty == true ? n['note'] : timeStr, style: const TextStyle(fontSize: 12, color: Colors.grey)),
            if (n['response'] != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: const Color(0xFFEEF2FF), borderRadius: BorderRadius.circular(8)),
                child: Row(
                  children: [
                    const Icon(Icons.support_agent, size: 16, color: Colors.indigo),
                    const SizedBox(width: 6),
                    Expanded(child: Text('رد الإدارة: ${n['response']}', style: const TextStyle(fontSize: 13))),
                  ],
                ),
              ),
              if (_driverReply != null) ...[
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(8)),
                  child: Text('ردّك: $_driverReply', style: const TextStyle(fontSize: 13)),
                ),
              ] else if (_showReplyBox) ...[
                const SizedBox(height: 8),
                TextField(
                  controller: _replyController,
                  decoration: const InputDecoration(border: OutlineInputBorder(), hintText: 'اكتب ردك هنا...', isDense: true),
                ),
                const SizedBox(height: 6),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _sending ? null : _sendReply,
                    child: _sending ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('إرسال ردي'),
                  ),
                ),
              ] else
                TextButton(onPressed: () => setState(() => _showReplyBox = true), child: const Text('الرد على الإدارة')),
            ],
          ],
        ),
      ),
    );
  }
}
