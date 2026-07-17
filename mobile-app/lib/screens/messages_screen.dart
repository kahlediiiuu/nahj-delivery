import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../services/api_service.dart';
import '../services/app_strings.dart';

class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key});

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  List<dynamic> _messages = [];
  bool _loading = true;
  bool _uploading = false;
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _load();
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final result = await ApiService.getMyMessages();
      if (result['success'] == true) {
        setState(() => _messages = result['messages'] ?? []);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_scrollController.hasClients) {
            _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
          }
        });
      }
    } catch (_) {}
    if (!silent) setState(() => _loading = false);
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    _controller.clear();
    try {
      await ApiService.sendMessage(text);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppStrings.get('connectionError')), backgroundColor: Colors.red),
        );
      }
    }
    _load();
  }

  Future<void> _pickAndSendFile() async {
    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 50,
        maxWidth: 1280,
      );
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

      final base64 = base64Encode(bytes);
      final result = await ApiService.sendAttachment(
        fileBase64: base64,
        fileName: picked.name,
        mimeType: 'image/jpeg',
        caption: _controller.text.trim().isEmpty ? null : _controller.text.trim(),
      );

      if (result['success'] == true) {
        _controller.clear();
        _load();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result['message'] ?? 'تعذّر رفع الملف'), backgroundColor: Colors.red),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذّر رفع الملف: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Widget _buildAttachment(Map m) {
    final data = m['attachmentData'];
    if (data == null) return const SizedBox.shrink();
    final type = m['attachmentType']?.toString() ?? '';
    if (type.startsWith('image/')) {
      try {
        final bytes = base64Decode(data);
        return Padding(
          padding: const EdgeInsets.only(top: 6),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Image.memory(bytes, width: 180, fit: BoxFit.cover),
          ),
        );
      } catch (_) {
        return const SizedBox.shrink();
      }
    }
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.insert_drive_file, size: 18),
          const SizedBox(width: 4),
          Flexible(child: Text(m['attachmentName']?.toString() ?? 'ملف مرفق', style: const TextStyle(decoration: TextDecoration.underline))),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(AppStrings.get('messages'))),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                    ? Center(child: Text(AppStrings.get('noMessagesYet'), style: const TextStyle(color: Colors.grey)))
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(12),
                        itemCount: _messages.length,
                        itemBuilder: (ctx, i) {
                          final m = _messages[i];
                          final isMine = m['sender'] == 'driver';
                          return GestureDetector(
                            onLongPress: () async {
                              final confirm = await showDialog<bool>(
                                context: context,
                                builder: (ctx) => AlertDialog(
                                  content: const Text('حذف هذه الرسالة؟'),
                                  actions: [
                                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
                                    TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حذف', style: TextStyle(color: Colors.red))),
                                  ],
                                ),
                              );
                              if (confirm == true) {
                                await ApiService.deleteMessage(m['id']);
                                _load();
                              }
                            },
                            child: Align(
                            alignment: isMine ? Alignment.centerLeft : Alignment.centerRight,
                            child: Container(
                              margin: const EdgeInsets.symmetric(vertical: 4),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              constraints: BoxConstraints(maxWidth:
