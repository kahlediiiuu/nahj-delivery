import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String baseUrl = 'https://nahj-backend.onrender.com/api';

  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('token');
  }

  static Future<void> saveSession(String token, Map<String, dynamic> driver) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', token);
    await prefs.setString('driverName', driver['name'] ?? '');
    await prefs.setString('driverCode', driver['driverCode'] ?? '');
  }

  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
  }

  static Future<Map<String, dynamic>> login(String driverCode, String password) async {
    final res = await http.post(
      Uri.parse('$baseUrl/auth/driver/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'driverCode': driverCode, 'password': password}),
    ).timeout(const Duration(seconds: 60));
    return jsonDecode(res.body);
  }

  static const String _queueKey = 'pending_locations_queue';
  static const int _maxQueueSize = 2000;

  static Future<bool> sendLocation(Map<String, dynamic> payload) async {
    await flushQueue();
    try {
      final token = await getToken();
      if (token == null) return false;
      final res = await http
          .post(
            Uri.parse('$baseUrl/location/update'),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token',
            },
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) return true;
      await _enqueue(payload);
      return false;
    } catch (_) {
      await _enqueue(payload);
      return false;
    }
  }

  static Future<void> _enqueue(Map<String, dynamic> payload) async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(_queueKey) ?? <String>[];
    final withTimestamp = Map<String, dynamic>.from(payload);
    withTimestamp['timestamp'] = DateTime.now().millisecondsSinceEpoch;
    list.add(jsonEncode(withTimestamp));
    while (list.length > _maxQueueSize) {
      list.removeAt(0);
    }
    await prefs.setStringList(_queueKey, list);
  }

  static Future<void> flushQueue() async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(_queueKey) ?? <String>[];
    if (list.isEmpty) return;
    final token = await getToken();
    if (token == null) return;
    try {
      final points = list.map((s) => jsonDecode(s)).toList();
      final res = await http
          .post(
            Uri.parse('$baseUrl/location/batch'),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token',
            },
            body: jsonEncode({'points': points}),
          )
          .timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        await prefs.remove(_queueKey);
      }
    } catch (_) {}
  }

  static Future<int> pendingQueueCount() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getStringList(_queueKey) ?? []).length;
  }

  static Future<void> registerLanguage(String language) async {
    final token = await getToken();
    if (token == null) return;
    try {
      await http.post(
        Uri.parse('$baseUrl/auth/driver/language'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
        body: jsonEncode({'language': language}),
      ).timeout(const Duration(seconds: 15));
    } catch (_) {}
  }

  static Future<void> registerFcmToken(String fcmToken) async {
    final token = await getToken();
    if (token == null) return;
    try {
      await http.post(
        Uri.parse('$baseUrl/auth/driver/fcm-token'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
        body: jsonEncode({'fcmToken': fcmToken}),
      ).timeout(const Duration(seconds: 15));
    } catch (_) {}
  }

  static Future<bool> respondToMessage(String messageId, String response) async {
    final token = await getToken();
    final res = await http.post(
      Uri.parse('$baseUrl/messages/$messageId/respond'),
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
      body: jsonEncode({'response': response}),
    ).timeout(const Duration(seconds: 30));
    return res.statusCode == 200;
  }

  static Future<Map<String, dynamic>> submitLeaveRequest({
    required String reasonType,
    required String date,
    String? note,
  }) async {
    final token = await getToken();
    final res = await http.post(
      Uri.parse('$baseUrl/leave'),
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
      body: jsonEncode({'reasonType': reasonType, 'date': date, 'note': note}),
    ).timeout(const Duration(seconds: 30));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> getMyLeaveRequests() async {
    final token = await getToken();
    final res = await http.get(
      Uri.parse('$baseUrl/leave/my'),
      headers: {'Authorization': 'Bearer $token'},
    ).timeout(const Duration(seconds: 30));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> getContactInfo() async {
    final token = await getToken();
    final res = await http.get(
      Uri.parse('$baseUrl/settings/contact'),
      headers: {'Authorization': 'Bearer $token'},
    ).timeout(const Duration(seconds: 15));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> addWorkHourRange(String date, String start, String end) async {
    final token = await getToken();
    final res = await http.post(
      Uri.parse('$baseUrl/workhours'),
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
      body: jsonEncode({'date': date, 'start': start, 'end': end}),
    ).timeout(const Duration(seconds: 30));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> deleteWorkHourRange(String date, int index) async {
    final token = await getToken();
    final res = await http.delete(
      Uri.parse('$baseUrl/workhours/$date/$index'),
      headers: {'Authorization': 'Bearer $token'},
    ).timeout(const Duration(seconds: 30));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> getWorkHours(String date) async {
    final token = await getToken();
    final res = await http.get(
      Uri.parse('$baseUrl/workhours/my?date=$date'),
      headers: {'Authorization': 'Bearer $token'},
    ).timeout(const Duration(seconds: 30));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> getWorkHoursHistory() async {
    final token = await getToken();
    final res = await http.get(
      Uri.parse('$baseUrl/workhours/my/history'),
      headers: {'Authorization': 'Bearer $token'},
    ).timeout(const Duration(seconds: 30));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> submitDailyNote({
    required String type,
    String? note,
    String? attachmentData,
    String? attachmentType,
  }) async {
    final token = await getToken();
    final res = await http.post(
      Uri.parse('$baseUrl/dailynotes'),
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
      body: jsonEncode({
        'type': type,
        'note': note,
        'attachmentData': attachmentData,
        'attachmentType': attachmentType,
      }),
    ).timeout(const Duration(seconds: 60));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> getMyDailyNotes() async {
    final token = await getToken();
    final res = await http.get(
      Uri.parse('$baseUrl/dailynotes/my'),
      headers: {'Authorization': 'Bearer $token'},
    ).timeout(const Duration(seconds: 30));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> getMyReport({String? date}) async {
    final token = await getToken();
    final uri = date != null
        ? Uri.parse('$baseUrl/location/my-stats?date=$date')
        : Uri.parse('$baseUrl/location/my-stats');
    final res = await http.get(uri, headers: {'Authorization': 'Bearer $token'}).timeout(const Duration(seconds: 60));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> getMyMessages() async {
    final token = await getToken();
    final res = await http.get(Uri.parse('$baseUrl/messages/my'), headers: {'Authorization': 'Bearer $token'}).timeout(const Duration(seconds: 60));
    return jsonDecode(res.body);
  }

  static Future<int> getUnreadMessageCount() async {
    try {
      final token = await getToken();
      final res = await http.get(Uri.parse('$baseUrl/messages/my/unread-count'), headers: {'Authorization': 'Bearer $token'}).timeout(const Duration(seconds: 15));
      final data = jsonDecode(res.body);
      return data['unreadCount'] ?? 0;
    } catch (_) {
      return 0;
    }
  }

  static Future<Map<String, dynamic>> sendAttachment({
    required String fileBase64,
    required String fileName,
    required String mimeType,
    String? caption,
  }) async {
    final token = await getToken();
    final res = await http.post(
      Uri.parse('$baseUrl/attachments'),
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
      body: jsonEncode({
        'fileBase64': fileBase64,
        'fileName': fileName,
        'mimeType': mimeType,
        'caption': caption,
      }),
    ).timeout(const Duration(seconds: 60));
    return jsonDecode(res.body);
  }

  static Future<bool> sendMessage(String text) async {
    final token = await getToken();
    final res = await http.post(
      Uri.parse('$baseUrl/messages'),
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
      body: jsonEncode({'text': text}),
    ).timeout(const Duration(seconds: 60));
    return res.statusCode == 200;
  }

  static Future<Map<String, dynamic>> getMyPerformance({String? date}) async {
    final token = await getToken();
    final uri = date != null
        ? Uri.parse('$baseUrl/performance/my?date=$date')
        : Uri.parse('$baseUrl/performance/my');
    final res = await http.get(uri, headers: {'Authorization': 'Bearer $token'}).timeout(const Duration(seconds: 60));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> getOrdersForDay(String date) async {
    final token = await getToken();
    final res = await http.get(
      Uri.parse('$baseUrl/orders/day?date=$date'),
      headers: {'Authorization': 'Bearer $token'},
    ).timeout(const Duration(seconds: 60));
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> addOrder({
    required String status,
    String? failureReason,
    String? verificationMethod,
    String? note,
  }) async {
    final token = await getToken();
    final res = await http.post(
      Uri.parse('$baseUrl/orders'),
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
      body: jsonEncode({
        'status': status,
        'failureReason': failureReason,
        'verificationMethod': verificationMethod,
        'note': note,
      }),
    ).timeout(const Duration(seconds: 60));
    return jsonDecode(res.body);
  }

  static Future<bool> deleteOrder(String id) async {
    final token = await getToken();
    final res = await http.delete(
      Uri.parse('$baseUrl/orders/$id'),
      headers: {'Authorization': 'Bearer $token'},
    ).timeout(const Duration(seconds: 60));
    return res.statusCode == 200;
  }

  static Future<bool> startShift() async {
    final token = await getToken();
    final res = await http.post(
      Uri.parse('$baseUrl/location/shift/start'),
      headers: {'Authorization': 'Bearer $token'},
    ).timeout(const Duration(seconds: 60));
    return res.statusCode == 200;
  }

  static Future<bool> endShift() async {
    final token = await getToken();
    final res = await http.post(
      Uri.parse('$baseUrl/location/shift/end'),
      headers: {'Authorization': 'Bearer $token'},
    ).timeout(const Duration(seconds: 60));
    return res.statusCode == 200;
  }
}
