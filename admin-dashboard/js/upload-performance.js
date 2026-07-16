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

function guessDriverId(rawName, rowValues) {
  const allValuesText = rowValues.map((v) => String(v).trim().toLowerCase()).join(' | ');

  const byCode = driversList.find(
    (d) => d.matchCode && allValuesText.includes(String(d.matchCode).trim().toLowerCase())
  );
  if (byCode) return byCode.id;

  if (!rawName) return '';
  const clean = String(rawName).trim().toLowerCase();
  const byName = driversList.find((d) => d.name && d.name.trim().toLowerCase() === clean);
  return byName ? byName.id : '';
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
      const keys = Object.keys(row);
      const values = Object.values(row);
      const findVal = (patterns) => {
        const key = keys.find((k) => patterns.some((p) => k.toLowerCase().includes(p)));
        return key ? row[key] : '';
      };
      const name = findVal(['اسم', 'name', 'مندوب', 'driver']);
      return {
        rawName: name,
        driverId: guessDriverId(name, values),
        ordersAccepted: Number(findVal(['مقبول', 'accept', 'قبول'])) || 0,
        ordersRejected: Number(findVal(['مرفوض', 'reject', 'رفض'])) || 0,
        verificationCount: Number(findVal(['تحقق', 'verif'])) || 0,
        grade: '',
      };
    });

    renderPreview();
    document.getElementById('previewSection').style.display = 'block';
  };
  reader.readAsArrayBuffer(file);
});

const gradeOptions = [
  { value: '', label: '— اختر الفئة —' },
  { value: 'A', label: '👑 A - نخبة متميزة' },
  { value: 'B', label: '🥈 B - أداء جيد جدًا' },
  { value: 'C', label: '🥉 C - أداء متوسط' },
  { value: 'D', label: '⚠️ D - قائمة المتابعة' },
];

function renderPreview() {
  const tbody = document.getElementById('previewBody');
  tbody.innerHTML = parsedRows
    .map(
      (row, i) => `
    <tr style="${row.driverId ? '' : 'background:#fef2f2;'}">
      <td>${row.rawName}</td>
      <td>
        <select onchange="updateRow(${i}, 'driverId', this.value)">
          <option value="">— اختر المندوب —</option>
          ${driversList.map((d) => `<option value="${d.id}" ${row.driverId === d.id ? 'selected' : ''}>${d.name} (#${d.driverCode})</option>`).join('')}
        </select>
      </td>
      <td><input type="number" value="${row.ordersAccepted}" onchange="updateRow(${i}, 'ordersAccepted', this.value)" style="width:70px"></td>
      <td><input type="number" value="${row.ordersRejected}" onchange="updateRow(${i}, 'ordersRejected', this.value)" style="width:70px"></td>
      <td><input type="number" value="${row.verificationCount}" onchange="updateRow(${i}, 'verificationCount', this.value)" style="width:70px"></td>
      <td>
        <select onchange="updateRow(${i}, 'grade', this.value)">
          ${gradeOptions.map((g) => `<option value="${g.value}" ${row.grade === g.value ? 'selected' : ''}>${g.label}</option>`).join('')}
        </select>
      </td>
    </tr>`
    )
    .join('');
}

window.updateRow = function (index, field, value) {
  parsedRows[index][field] = field.includes('Count') || field.includes('Accepted') || field.includes('Rejected') ? Number(value) : value;
};

document.getElementById('submitBtn').addEventListener('click', async () => {
  const date = document.getElementById('reportDate').value;
  const msg = document.getElementById('uploadMsg');
  const validRows = parsedRows.filter((r) => r.driverId);

  if (validRows.length === 0) {
    msg.textContent = 'لم يتم ربط أي صف بمندوب، تأكد من اختيار المندوب لكل صف (أو ضبط رمز المطابقة له من صفحة إدارة المناديب)';
    msg.style.color = '#dc2626';
    return;
  }

  try {
    const res = await fetch(`${NAHJ_API_URL}/performance/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ date, records: validRows }),
    });
    const data = await res.json();
    if (data.success) {
      msg.textContent = `تم رفع تقرير ${data.count} مندوب بنجاح ليوم ${date}، ووصلهم إشعار فوري بذلك.`;
      msg.style.color = '#16a34a';
    } else {
      msg.textContent = data.message || 'حدث خطأ';
      msg.style.color = '#dc2626';
    }
  } catch (err) {
    msg.textContent = 'تعذّر الاتصال بالخادم';
    msg.style.color = '#dc2626';
  }
});
