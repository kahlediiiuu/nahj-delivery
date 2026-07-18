import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/app_strings.dart';

class PerformanceReportScreen extends StatefulWidget {
  const PerformanceReportScreen({super.key});

  @override
  State<PerformanceReportScreen> createState() => _PerformanceReportScreenState();
}

class _PerformanceReportScreenState extends State<PerformanceReportScreen> with SingleTickerProviderStateMixin {
  DateTime _selectedDate = DateTime.now().subtract(const Duration(days: 1));
  bool _loading = true;
  Map<String, dynamic>? _data;
  String? _error;

  List<dynamic> _comments = [];
  final _commentController = TextEditingController();
  bool _sendingComment = false;

  late AnimationController _shineController;

  String get _dateKey =>
      '${_selectedDate.year.toString().padLeft(4, '0')}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';

  @override
  void initState() {
    super.initState();
    _shineController = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat(reverse: true);
    _load();
  }

  @override
  void dispose() {
    _shineController.dispose();
    _commentController.dispose();
    super.dispose();
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
    _loadComments();
  }

  Future<void> _loadComments() async {
    try {
      final result = await ApiService.getReportComments(_dateKey);
      if (result['success'] == true) {
        setState(() => _comments = result['comments'] ?? []);
      }
    } catch (_) {}
  }

  Future<void> _sendComment() async {
    final text = _commentController.text.trim();
    if (text.isEmpty) return;
    setState(() => _sendingComment = true);
    try {
      final result = await ApiService.addReportComment(_dateKey, text);
      if (result['success'] == true) {
        _commentController.clear();
        _loadComments();
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppStrings.get('connectionError')), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _sendingComment = false);
    }
  }

  void _changeDay(int delta) {
    setState(() => _selectedDate = _selectedDate.add(Duration(days: delta)));
    _load();
  }

  List<Color> _gradientFor(String? colorKey) {
    switch (colorKey) {
      case 'gold':
        return [const Color(0xFFD4AF37), const Color(0xFFF9E79F), const Color(0xFFB8860B)];
      case 'silver':
        return [const Color(0xFF9CA3AF), const Color(0xFFE5E7EB), const Color(0xFF6B7280)];
      case 'yellow':
        return [const Color(0xFFEAB308), const Color(0xFFFDE68A)];
      case 'red':
        return [const Color(0xFFDC2626), const Color(0xFFFCA5A5)];
      default:
        return [Colors.blueGrey, Colors.blueGrey.shade200];
    }
  }

  Color _solidColorFor(String? colorKey) {
    switch (colorKey) {
      case 'gold':
        return const Color(0xFFB8860B);
      case 'silver':
        return const Color(0xFF6B7280);
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
      case 'D':
        return Icons.trending_down;
      case 'E':
        return Icons.warning_amber_rounded;
      case 'F':
        return Icons.error_outline;
      default:
        return Icons.info;
    }
  }

  @override
  Widget build(BuildContext context) {
    final found = _data != null && _data!['found'] == true;
    final hidden = _data != null && _data!['hidden'] == true;
    final colorKey = found ? _data!['categoryColor']?.toString() : null;
    final grade = found ? _data!['grade']?.toString() : null;
    final isPremium = colorKey == 'gold' || colorKey == 'silver';

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
              // ===== بطاقة الفئة (بتصميم فاخر متحرك للفئتين A وB) =====
              AnimatedBuilder(
                animation: _shineController,
                builder: (context, child) {
                  final shine = isPremium ? (0.7 + 0.3 * _shineController.value) : 1.0;
                  return Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: _gradientFor(colorKey).map((c) => c.withOpacity(shine)).toList(),
                        begin: Alignment.topRight,
                        end: Alignment.bottomLeft,
                      ),
                      borderRadius: BorderRadius.circular(22),
                      boxShadow: [
                        BoxShadow(
                          color: _solidColorFor(colorKey).withOpacity(isPremium ? 0.5 : 0.3),
                          blurRadius: isPremium ? 20 : 16,
                          offset: const Offset(0, 8),
                        ),
                      ],
                      border: isPremium ? Border.all(color: Colors.white.withOpacity(0.6), width: 1.5) : null,
                    ),
                    child: Column(
                      children: [
                        Icon(_iconFor(grade), size: 56, color: Colors.white, shadows: isPremium ? [const Shadow(blurRadius: 12, color: Colors.white70)] : null),
                        const SizedBox(height: 10),
                        Text(
                          _data!['categoryLabel']?.toString().isNotEmpty == true
                              ? _data!['categoryLabel']
                              : AppStrings.get('category'),
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 21, fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                        if (_data!['city'] != null && _data!['city'].toString().isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text('📍 ${_data!['city']}', style: const TextStyle(color: Colors.white70, fontSize: 13)),
                        ],
                      ],
                    ),
                  );
                },
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
                              color: _solidColorFor(colorKey),
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

              // ===== لماذا حصلت على هذه الفئة؟ =====
              if (_data!['reasons'] != null && (_data!['reasons'] as List).isNotEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('🔍 لماذا حصلت على هذه الفئة؟', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      const SizedBox(height: 10),
                      ...List<String>.from(_data!['reasons']).map((r) => Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('• ', style: TextStyle(fontWeight: FontWeight.bold)),
                                Expanded(child: Text(r, style: const TextStyle(fontSize: 13))),
                              ],
                            ),
                          )),
                    ],
                  ),
                ),

              // ===== كيف تصل إلى الفئة التالية؟ =====
              if (_data!['tips'] != null && (_data!['tips'] as List).isNotEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(color: Colors.green.withOpacity(0.06), borderRadius: BorderRadius.circular(16)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('🚀 كيف تصل إلى الفئة التالية؟', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      const SizedBox(height: 10),
                      ...List<String>.from(_data!['tips']).map((t) => Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Icon(Icons.check_circle, color: Colors.green, size: 16),
                                const SizedBox(width: 6),
                                Expanded(child: Text(t, style: const TextStyle(fontSize: 13))),
                              ],
                            ),
                          )),
                    ],
                  ),
                ),

              // ===== شريط التقدم للفئة التالية =====
              if (_data!['progress'] != null)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '🎯 يتبقى لك ${_data!['progress']['pointsNeeded']}% للانتقال إلى الفئة ${_data!['progress']['nextGrade']}',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                      const SizedBox(height: 10),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(
                          value: (_data!['progress']['progressPercent'] as num) / 100,
                          minHeight: 10,
                          backgroundColor: Colors.grey.shade200,
                          color: _solidColorFor(colorKey),
                        ),
                      ),
                    ],
                  ),
                ),

              // ===== مقارنة مع التقرير السابق =====
              if (_data!['comparison'] != null)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: (_data!['comparison']['improved'] == true ? Colors.green : Colors.red).withOpacity(0.08),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        _data!['comparison']['improved'] == true ? Icons.trending_up : Icons.trending_down,
                        color: _data!['comparison']['improved'] == true ? Colors.green : Colors.red,
                      ),
                      const SizedBox(width: 10),
                      Text(
                        _data!['comparison']['improved'] == true
                            ? 'تحسّن أداؤك بنسبة ${_data!['comparison']['diffPercent'].abs()}% مقارنة بالتقرير السابق'
                            : 'تراجع أداؤك بنسبة ${_data!['comparison']['diffPercent'].abs()}% مقارنة بالتقرير السابق',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 12.5,
                          color: _data!['comparison']['improved'] == true ? Colors.green.shade800 : Colors.red.shade800,
                        ),
                      ),
                    ],
                  ),
                ),

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

              // ===== قسم ملاحظات المندوب المرتبطة مباشرة بهذا التقرير =====
              const SizedBox(height: 24),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('💬 ملاحظاتك على هذا التقرير', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                    const SizedBox(height: 12),
                    if (_comments.isEmpty)
                      const Text('لا توجد ملاحظات بعد، يمكنك كتابة تعليق أو استفسار أو شكوى أدناه.', style: TextStyle(color: Colors.grey, fontSize: 13))
                    else
                      ..._comments.map((c) => Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(10)),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(c['text'] ?? '', style: const TextStyle(fontSize: 13)),
                                if (c['response'] != null) ...[
                                  const Divider(height: 16),
                                  Row(
                                    children: [
                                      const Icon(Icons.support_agent, size: 16, color: Colors.blue),
                                      const SizedBox(width: 6),
                                      Expanded(child: Text(c['response'], style: const TextStyle(fontSize: 13, color: Colors.blue))),
                                    ],
                                  ),
                                ] else
                                  const Padding(
                                    padding: EdgeInsets.only(top: 6),
                                    child: Text('⏳ بانتظار رد الإدارة', style: TextStyle(fontSize: 11, color: Colors.orange)),
                                  ),
                              ],
                            ),
                          )),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _commentController,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        hintText: 'اكتب تعليقًا، اقتراحًا، استفسارًا، أو شكوى...',
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _sendingComment ? null : _sendComment,
                        child: _sendingComment
                            ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Text('إرسال للإدارة'),
                      ),
                    ),
                  ],
                ),
              ),
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
