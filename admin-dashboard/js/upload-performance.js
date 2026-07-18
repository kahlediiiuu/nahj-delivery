const token = sessionStorage.getItem('nahj_admin_token');
if (!token) window.location.href = 'login.html';

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'login.html';
});

let driversList = [];
let parsedRows = [];

async function loadDrivers() {
  const res = await fetch(`${NAHJ_API_URL}/drivers`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.success) driversList = data.drivers;
}
loadDrivers();

const yesterday = new Date(Date.now() - 86400000);
document.getElementById('reportDate').valueAsDate = yesterday;

// مطابقة تلقائية دقيقة عبر rider_id (يُطابَق مع رمز المطابقة المسجَّل لكل مندوب في صفحة إدارة المناديب)
function matchDriverByRiderId(riderId) {
  if (!riderId) return '';
  const clean = String(riderId).trim();
  const byCode = driversList.find((d) => d.matchCode && String(d.matchCode).trim() === clean);
  if (byCode) return byCode.id;
  // احتياطي: قد يكون رقم المندوب نفسه (driverCode) مطابقًا لرقم rider_id في بعض الحالات
  const byDriverCode = driversList.find((d) => d.driverCode && String(d.driverCode).trim() === clean);
  return byDriverCode ? byDriverCode.id : '';
}

function toPercent(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'string' && val.includes('%')) return parseFloat(val.replace('%', '')) || 0;
  const num = Number(val);
  return num <= 1 ? +(num * 100).toFixed(2) : num;
}

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

    parsedRows = rows.map((row) => {
      // نبحث عن الأعمدة بمرونة (تدعم الصيغة الحقيقية rider_id, gross_orders...، وأيضًا صيغًا عربية بديلة)
      const findVal = (patterns) => {
        const key = Object.keys(row).find((k) => patterns.some((p) => k.toLowerCase().includes(p)));
        return key !== undefined ? row[key] : '';
      };

      const riderId = findVal(['rider_id', 'rider id', 'معرف', 'id']);
      const segment = String(findVal(['segment', 'الفئة', 'فئة'])).trim().toUpperCase();
      // completed_orders قد يلتبس مع completed_orders_in_time لأنه جزء منه نصيًا - نبحث عن المطابقة الدقيقة أولاً
      const completedOrdersExact = row['completed_orders'] !== undefined ? row['completed_orders'] : findVal(['completed_orders']);

      return {
        riderId,
        driverId: matchDriverByRiderId(riderId),
        city: findVal(['city', 'المدينة']),
        grossOrders: Number(findVal(['gross_orders', 'إجمالي'])) || 0,
        completedOrders: Number(completedOrdersExact) || 0,
        completedOrdersInTime: Number(findVal(['completed_orders_in_time', 'in_time'])) || 0,
        failedOrders: Number(findVal(['failed_orders', 'مرفوض'])) || 0,
        totalVerificationRequests: Number(findVal(['total_verification'])) || 0,
        verificationSuccessRate: toPercent(findVal(['verification_success_rate'])),
        onTimeDeliveryScore: toPercent(findVal(['on_time_delivery_score'])),
        finalQualityScore: Number(findVal(['final_delivery_quality_score', 'quality_score'])) || 0,
        grade: ['A', 'B', 'C', 'D', 'E', 'F'].includes(segment) ? segment : '',
      };
    });

    renderPreview();
    document.getElementById('previewSection').style.display = 'block';
  };
  reader.readAsArrayBuffer(file);
});

const gradeOptions = [
  { value: '', label: '— بدون فئة —' },
  { value: 'A', label: '👑 A - نخبة متميزة' },
  { value: 'B', label: '🥈 B - أداء جيد جدًا' },
  { value: 'C', label: '🥉 C - أداء متوسط' },
  { value: 'D', label: '🔸 D - أداء دون المتوسط' },
  { value: 'E', label: '🔻 E - ضعيف، يحتاج متابعة' },
  { value: 'F', label: '⚠️ F - قائمة الخطر' },
];

function renderPreview() {
  const tbody = document.getElementById('previewBody');
  tbody.innerHTML = parsedRows
    .map(
      (row, i) => `
    <tr style="${row.driverId ? '' : 'background:#fef2f2;'}">
      <td style="font-family:monospace;">${row.riderId}</td>
      <td>
        <select onchange="updateRow(${i}, 'driverId', this.value)">
          <option value="">— لم تُطابَق —</option>
          ${driversList.map((d) => `<option value="${d.id}" ${row.driverId === d.id ? 'selected' : ''}>${d.name} (#${d.driverCode})</option>`).join('')}
        </select>
      </td>
      <td>${row.city}</td>
      <td>${row.completedOrders}/${row.grossOrders}</td>
      <td>${row.onTimeDeliveryScore}%</td>
      <td>
        <select onchange="updateRow(${i}, 'grade', this.value)">
          ${gradeOptions.map((g) => `<option value="${g.value}" ${row.grade === g.value ? 'selected' : ''}>${g.label}</option>`).join('')}
        </select>
      </td>
    </tr>`
    )
    .join('');

  const matchedCount = parsedRows.filter((r) => r.driverId).length;
  document.getElementById('matchSummary').textContent = `تمت مطابقة ${matchedCount} من أصل ${parsedRows.length} صفًا تلقائيًا عبر رمز المطابقة (rider_id).`;
}

window.updateRow = function (index, field, value) {
  parsedRows[index][field] = value;
};

document.getElementById('submitBtn').addEventListener('click', () => submitReport(false));

async function submitReport(confirmReplace) {
  const date = document.getElementById('reportDate').value;
  const msg = document.getElementById('uploadMsg');
  const submitBtn = document.getElementById('submitBtn');
  const validRows = parsedRows.filter((r) => r.driverId);

  if (validRows.length === 0) {
    msg.textContent = 'لم يتم ربط أي صف بمندوب. تأكد من ضبط "رمز المطابقة" لكل مندوب (نفس قيمة rider_id) من صفحة إدارة المناديب.';
    msg.style.color = '#dc2626';
    return;
  }

  // منع الضغط المتكرر: تعطيل الزر فورًا حتى انتهاء العملية بالكامل
  submitBtn.disabled = true;
  submitBtn.textContent = 'جاري الرفع...';

  try {
    const res = await fetch(`${NAHJ_API_URL}/performance/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ date, records: validRows, confirmReplace }),
    });
    const data = await res.json();

    if (res.status === 409 && data.duplicate) {
      const wantsReplace = confirm(data.message + '\n\nاضغط "موافق" للاستبدال، أو "إلغاء" للتراجع.');
      submitBtn.disabled = false;
      submitBtn.textContent = '✅ رفع التقرير لكل المناديب';
      if (wantsReplace) {
        await submitReport(true);
      }
      return;
    }

    if (data.success) {
      msg.textContent = `تم رفع تقرير ${data.count} مندوب بنجاح ليوم ${date} (وسُجِّل ${data.absentCount} كغائبين)${confirmReplace ? '، تم تحديث التقرير بصمت بدون إشعارات مكررة' : '، ووصلهم إشعار فوري بذلك'}.`;
      msg.style.color = '#16a34a';
    } else {
      msg.textContent = data.message || 'حدث خطأ';
      msg.style.color = '#dc2626';
    }
  } catch (err) {
    msg.textContent = 'تعذّر الاتصال بالخادم';
    msg.style.color = '#dc2626';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '✅ رفع التقرير لكل المناديب';
  }
}
