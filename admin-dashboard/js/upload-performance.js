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

document.getElementById('reportDate').valueAsDate = new Date();

// محاولة مطابقة تلقائية بالاسم بين الملف والمناديب المسجّلين
function guessDriverId(rawName) {
  if (!rawName) return '';
  const clean = String(rawName).trim().toLowerCase();
  const match = driversList.find(
    (d) => d.name && d.name.trim().toLowerCase() === clean
  );
  return match ? match.id : '';
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

    // نحاول التعرف تلقائياً على الأعمدة الشائعة بأي تسمية عربية أو إنجليزية محتملة
    parsedRows = rows.map((row) => {
      const keys = Object.keys(row);
      const findVal = (patterns) => {
        const key = keys.find((k) => patterns.some((p) => k.toLowerCase().includes(p)));
        return key ? row[key] : '';
      };
      const name = findVal(['اسم', 'name', 'مندوب', 'driver']);
      return {
        rawName: name,
        driverId: guessDriverId(name),
        ordersAccepted: Number(findVal(['مقبول', 'accept', 'قبول'])) || 0,
        ordersRejected: Number(findVal(['مرفوض', 'reject', 'رفض'])) || 0,
        verificationCount: Number(findVal(['تحقق', 'verif'])) || 0,
        categoryLabel: findVal(['فئة', 'category', 'تقييم', 'rating']) || '',
        categoryColor: 'gray',
      };
    });

    renderPreview();
    document.getElementById('previewSection').style.display = 'block';
  };
  reader.readAsArrayBuffer(file);
});

function renderPreview() {
  const tbody = document.getElementById('previewBody');
  tbody.innerHTML = parsedRows
    .map(
      (row, i) => `
    <tr>
      <td>${row.rawName}</td>
      <td>
        <select onchange="updateRow(${i}, 'driverId', this.value)">
          <option value="">— اختر المندوب —</option>
          ${driversList.map((d) => `<option value="${d.id}" ${row.driverId === d.id ? 'selected' : ''}>${d.name} (#${d.driverCode})</option>`).join('')}
        </select>
      </td>
      <td><input type="number" value="${row.ordersAccepted}" onchange="updateRow(${i}, 'ordersAccepted', this.value)"></td>
      <td><input type="number" value="${row.ordersRejected}" onchange="updateRow(${i}, 'ordersRejected', this.value)"></td>
      <td><input type="number" value="${row.verificationCount}" onchange="updateRow(${i}, 'verificationCount', this.value)"></td>
      <td><input type="text" value="${row.categoryLabel}" onchange="updateRow(${i}, 'categoryLabel', this.value)"></td>
      <td>
        <select onchange="updateRow(${i}, 'categoryColor', this.value)">
          <option value="gray" ${row.categoryColor === 'gray' ? 'selected' : ''}>عادي</option>
          <option value="green" ${row.categoryColor === 'green' ? 'selected' : ''}>🟢 ممتاز</option>
          <option value="yellow" ${row.categoryColor === 'yellow' ? 'selected' : ''}>🟡 متوسط</option>
          <option value="red" ${row.categoryColor === 'red' ? 'selected' : ''}>🔴 خطر</option>
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
    msg.textContent = 'لم يتم ربط أي صف بمندوب، تأكد من اختيار المندوب لكل صف';
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
      msg.textContent = `تم رفع تقرير ${data.count} مندوب بنجاح ليوم ${date}.`;
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
