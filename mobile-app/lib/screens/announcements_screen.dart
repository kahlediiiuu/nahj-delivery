import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../services/api_service.dart';

class AnnouncementsScreen extends StatefulWidget {
  const AnnouncementsScreen({super.key});

  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen> {
  List<dynamic> _announcements = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final result = await ApiService.getAnnouncements();
      if (result['success'] == true) {
        setState(() => _announcements = result['announcements'] ?? []);
      } else {
        setState(() => _error = result['message'] ?? 'تعذّر تحميل الأخبار');
      }
    } catch (_) {
      setState(() => _error = 'تعذّر الاتصال بالخادم');
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(title: const Text('📢 أخبار وتعليمات الشركة')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
                : _announcements.isEmpty
                    ? ListView(
                        children: const [
                          Padding(
                            padding: EdgeInsets.symmetric(vertical: 80),
                            child: Center(child: Text('لا توجد إعلانات حاليًا', style: TextStyle(color: Colors.grey))),
                          ),
                        ],
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _announcements.length,
                        itemBuilder: (ctx, i) => _AnnouncementCard(announcement: _announcements[i]),
                      ),
      ),
    );
  }
}

class _AnnouncementCard extends StatefulWidget {
  final Map announcement;
  const _AnnouncementCard({required this.announcement});

  @override
  State<_AnnouncementCard> createState() => _AnnouncementCardState();
}

class _AnnouncementCardState extends State<_AnnouncementCard> {
  bool _showNoteBox = false;
  final _noteController = TextEditingController();
  String? _pickedImageBase64;
  bool _sending = false;
  bool _sent = false;

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(source: ImageSource.gallery, imageQuality: 50, maxWidth: 1280);
      if (picked == null) return;
      final bytes = await File(picked.path).readAsBytes();
      if (bytes.length > 700 * 1024) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('حجم الصورة كبير جدًا'), backgroundColor: Colors.red),
          );
        }
        return;
      }
      setState(() => _pickedImageBase64 = base64Encode(bytes));
    } catch (_) {}
  }

  Future<void> _send() async {
    if (_noteController.text.trim().isEmpty) return;
    setState(() => _sending = true);
    try {
      final result = await ApiService.sendAnnouncementNote(
        announcementId: widget.announcement['id'],
        note: _noteController.text.trim(),
        attachmentData: _pickedImageBase64,
        attachmentType: _pickedImageBase64 != null ? 'image/jpeg' : null,
      );
      if (result['success'] == true) {
        setState(() {
          _sent = true;
          _showNoteBox = false;
          _noteController.clear();
          _pickedImageBase64 = null;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('تم إرسال ملاحظتك للإدارة'), backgroundColor: Colors.green),
          );
        }
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

  @override
  Widget build(BuildContext context) {
    final a = widget.announcement;
    final time = DateTime.fromMillisecondsSinceEpoch(a['createdAt']);
    final timeStr = '${time.year}-${time.month.toString().padLeft(2, '0')}-${time.day.toString().padLeft(2, '0')}';

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(a['title'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 4),
            Text(timeStr, style: const TextStyle(fontSize: 11, color: Colors.grey)),
            const SizedBox(height: 10),
            Text(a['body'] ?? ''),
            if (a['attachmentData'] != null) ...[
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.memory(base64Decode(a['attachmentData']), fit: BoxFit.cover, width: double.infinity),
              ),
            ],
            const Divider(height: 24),
            if (_sent)
              const Row(
                children: [
                  Icon(Icons.check_circle, color: Colors.green, size: 18),
                  SizedBox(width: 6),
                  Text('تم إرسال ملاحظتك', style: TextStyle(color: Colors.green, fontSize: 13)),
                ],
              )
            else if (!_showNoteBox)
              OutlinedButton.icon(
                onPressed: () => setState(() => _showNoteBox = true),
                icon: const Icon(Icons.message_outlined, size: 18),
                label: const Text('إرسال ملاحظة للإدارة'),
              )
            else ...[
              TextField(
                controller: _noteController,
                maxLines: 2,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: 'اكتب رأيك أو استفسارك هنا...',
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  TextButton.icon(
                    onPressed: _pickImage,
                    icon: const Icon(Icons.attach_file, size: 18),
                    label: Text(_pickedImageBase64 == null ? 'إرفاق صورة' : 'تم إرفاق صورة ✓'),
                  ),
                  const Spacer(),
                  TextButton(onPressed: () => setState(() => _showNoteBox = false), child: const Text('إلغاء')),
                  const SizedBox(width: 4),
                  ElevatedButton(
                    onPressed: _sending ? null : _send,
                    child: _sending
                        ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('إرسال'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
