import 'package:flutter/material.dart';
import '../services/api_service.dart';

class WorkHoursScreen extends StatefulWidget {
  const WorkHoursScreen({super.key});

  @override
  State<WorkHoursScreen> createState() => _WorkHoursScreenState();
}

class _WorkHoursScreenState extends State<WorkHoursScreen> {
  DateTime _selectedDate = DateTime.now();
  List<dynamic> _ranges = [];
  int _totalMinutes = 0;
  List<dynamic> _history = [];
  bool _loading = true;

  String get _dateKey =>
      '${_selectedDate.year.toString().padLeft(4, '0')}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';

  @override
  void initState() {
    super.initState();
    _load();
    _loadHistory();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final result = await ApiService.getWorkHours(_dateKey);
      if (result['success'] == true) {
        setState(() {
          _ranges = result['ranges'] ?? [];
          _totalMinutes = result['totalMinutes'] ?? 0;
        });
      }
    } catch (_) {}
    setState(() => _loading = false);
  }

  Future<void> _loadHistory() async {
    try {
      final result = await ApiService.getWorkHoursHistory();
      if (result['success'] == true) {
        setState(() => _history = result['history'] ?? []);
      }
    } catch (_) {}
  }

  void _changeDay(int delta) {
    setState(() => _selectedDate = _selectedDate.add(Duration(days: delta)));
    _load();
  }

  String _formatMinutes(int minutes) {
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return '$h س $m د';
  }

  Future<void> _addRange() async {
    final start = await _pickTime('اختر وقت البداية');
    if (start == null || !mounted) return;
    final end = await _pickTime('اختر وقت النهاية');
    if (end == null) return;

    try {
      final result = await ApiService.addWorkHourRange(_dateKey, start, end);
      if (result['success'] == true) {
        setState(() {
          _ranges = result['ranges'] ?? [];
          _totalMinutes = result['totalMinutes'] ?? 0;
        });
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
    }
  }

  Future<String?> _pickTime(String label) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
      helpText: label,
    );
    if (picked == null) return null;
    return '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
  }

  Future<void> _deleteRange(int index) async {
    try {
      final result = await ApiService.deleteWorkHourRange(_dateKey, index);
      if (result['success'] == true) {
        setState(() {
          _ranges = result['ranges'] ?? [];
          _totalMinutes = result['totalMinutes'] ?? 0;
        });
        _loadHistory();
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(title: const Text('⏱️ ساعات عملي')),
      body: RefreshIndicator(
        onRefresh: () async { await _load(); await _loadHistory(); },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.blue.withOpacity(0.08), borderRadius: BorderRadius.circular(12)),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, color: Colors.blue, size: 18),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'هذه أداة اختيارية لمساعدتك على معرفة ساعات عملك الفعلية، ولا علاقة لها بتتبع موقعك.',
                      style: TextStyle(fontSize: 12, color: Colors.blueGrey),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
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
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFF0F172A), Color(0xFF1E293B)]),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Column(
                children: [
                  const Text('إجمالي ساعات هذا اليوم', style: TextStyle(color: Colors.white70, fontSize: 13)),
                  const SizedBox(height: 6),
                  Text(_formatMinutes(_totalMinutes), style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_ranges.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(child: Text('لم تُضِف أي فترة عمل بعد لهذا اليوم', style: TextStyle(color: Colors.grey))),
              )
            else
              ..._ranges.asMap().entries.map((entry) {
                final i = entry.key;
                final r = entry.value;
                return Card(
                  child: ListTile(
                    leading: const Icon(Icons.schedule),
                    title: Text('${r['start']} — ${r['end']}'),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline, color: Colors.red),
                      onPressed: () => _deleteRange(i),
                    ),
                  ),
                );
              }),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _addRange,
                icon: const Icon(Icons.add),
                label: const Text('إضافة فترة عمل'),
                style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
              ),
            ),
            const SizedBox(height: 28),
            const Text('سجل الأيام السابقة', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            const SizedBox(height: 10),
            if (_history.isEmpty)
              const Text('لا يوجد سجل سابق بعد', style: TextStyle(color: Colors.grey))
            else
              ..._history.map((h) => Card(
                    child: ListTile(
                      dense: true,
                      title: Text(h['date']),
                      trailing: Text(_formatMinutes(h['totalMinutes']), style: const TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  )),
          ],
        ),
      ),
    );
  }
}
