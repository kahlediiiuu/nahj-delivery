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

function matchDriverByRiderId(riderId) {
  if (!riderId) return '';
  const clean = String(riderId).trim();
  const byCode = driversList.find((d) => d.matchCode && String(d.matchCode).trim() === clean);
  if (byCode) return byCode.id;
  const byDriverCode = driversList.find((d) => d.driverCode && String(d.driverCode).trim() === clean);
  return byDriverCode ? byDriverCode.id : '';
}

function toPercent(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'string' && val.includes('%')) return parseFloat(val.replace('%', '')) || 0;
  const num = Number(val);
  return num <= 1 ? +(num * 100).toFixed(2) : num;
}
function toNumber(val) {
  return Number(val) || 0;
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
      const riderId = row['Rider Id'];
      return {
        riderId,
        driverId: matchDriverByRiderId(riderId),
        city: row['City Name'] || '',
        contractName: row['Contract Name'] || '',
        vehicleName: row['Vehicle Name'] || '',
        batchNumber: row['Batch Number'] || '',
        tgaStatus: row['TGA Status'] || '',
        errorCodes: row['Error Codes'] || '',
        shiftsCount: toNumber(row['# Shifts']),
        workingDays: toNumber(row['Working Days']),
        plannedWorkingHours: toNumber(row['Planned Working Hours']),
        actualWorkingHours: toNumber(row['Actual Working Hours']),
        avgWorkingHoursPerDay: toNumber(row['Avg. Working Hours/ Day']),
        attendanceRate: toPercent(row['Attendance Rate']),
        breakHours: toNumber(row['Break Hours']),
        lostHours: toNumber(row['Lost Hours']),
        acceptanceRate: toPercent(row['Acceptance Rate']),
        contactRate: toPercent(row['Contact Rate']),
        noShows: toNumber(row['No Shows']),
        noShowRate: toPercent(row['No Show %']),
        notifiedDeliveries: toNumber(row['Notified Deliveries']),
        completedDeliveries: toNumber(row['Completed Deliveries']),
        acceptedDeliveries: toNumber(row['Accepted Deliveries']),
        stackedDeliveries: toNumber(row['Stacked Deliveries']),
        declinedDeliveries: toNumber(row['Declined Deliveries']),
        cancelledDeliveries: toNumber(row['Cancelled Deliveries']),
        deductionDeliveries: toNumber(row['Deduction Deliveries']),
        notAcceptedDeliveries: toNumber(row['Not Accepted Deliveries']),
        manualUndispatched: toNumber(row['Manual Undispatched']),
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
    <tr style="${row.driverId ? '' : 'background:#fef2f2;'}">
      <td style="font-family:monospace;">${row.riderId}</td>
      <td>
        <select onchange="updateRow(${i}, this.value)">
          <option value="">— لم تُطابَق —</option>
          ${driversList.map((d) => `<option value="${d.id}" ${row.driverId === d.id ? 'selected' : ''}>${d.name} (#${d.driverCode})</option>`).join('')}
        </select>
      </td>
      <td>${row.city}</td>
      <td>${row.actualWorkingHours}</td>
      <td>${row.attendanceRate}%</td>
      <td>${row.acceptanceRate}%</td>
      <td>${row.noShows}</td>
    </tr>`
    )
    .join('');

  const matchedCount = parsedRows.filter((r) => r.driverId).length;
  document.getElementById('matchSummary').textContent = `تمت مطابقة ${matchedCount} من أصل ${parsedRows.length} صفًا تلقائيًا عبر رمز المطابقة (Rider Id).`;
}

window.updateRow = function (index, driverId) {
  parsedRows[index].driverId = driverId;
};

document.getElementById('submitBtn').addEventListener('click', () => submitReport(false));

async function submitReport(confirmReplace) {
  const date = document.getElementById('reportDate').value;
  const msg = document.getElementById('uploadMsg');
  const submitBtn = document.getElementById('submitBtn');
  const validRows = parsedRows.filter((r) => r.driverId);

  if (validRows.length === 0) {
    msg.textContent = 'لم يتم ربط أي صف بمندوب. تأكد من ضبط "رمز المطابقة" لكل مندوب من صفحة إدارة المناديب.';
    msg.style.color = '#dc2626';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'جاري الرفع...';

  try {
    const res = await fetch(`${NAHJ_API_URL}/operations/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ date, records: validRows, confirmReplace }),
    });
    const data = await res.json();

    if (res.status === 409 && data.duplicate) {
      const wantsReplace = confirm(data.message + '\n\nاضغط "موافق" للاستبدال، أو "إلغاء" للتراجع.');
      submitBtn.disabled = false;
      submitBtn.textContent = '✅ رفع تقرير التشغيل لكل المناديب';
      if (wantsReplace) await submitReport(true);
      return;
    }

    if (data.success) {
      msg.textContent = `تم رفع تقرير التشغيل لـ ${data.count} مندوب بنجاح ليوم ${date}${confirmReplace ? ' (استبدال صامت بدون إشعارات مكررة)' : '، ووصلهم إشعار فوري بذلك'}.`;
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
    submitBtn.textContent = '✅ رفع تقرير التشغيل لكل المناديب';
  }
}
