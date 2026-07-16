2. index.js
require('dotenv').config();

const express = require('express');
const cron = require('node-cron');
const glamera = require('./glameraAdapter');
const whatsapp = require('./whatsappAdapter');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const SUPERVISOR_WHATSAPP = process.env.SUPERVISOR_WHATSAPP || '9665XXXXXXXX';
const PURCHASING_WHATSAPP = process.env.PURCHASING_WHATSAPP || '9665XXXXXXXX';
const CASH_DISCREPANCY_THRESHOLD = Number(process.env.CASH_DISCREPANCY_THRESHOLD || 20);

const CASH_AUDIT_CRON = process.env.CASH_AUDIT_CRON || '0 0,12 * * *';
const STAFF_SYNC_CRON = process.env.STAFF_SYNC_CRON || '0 * * * *';
const INVENTORY_CRON = process.env.INVENTORY_CRON || '*/30 * * * *';

const DEPARTMENTS = ['massage', 'hammam', 'pedicure', 'facial'];

const DEPARTMENT_LABELS_AR = {
  massage: 'المساج',
  hammam: 'الحمام المغربي',
  pedicure: 'البديكير',
  facial: 'تنظيف البشرة',
};

const CATEGORY_LABELS_AR = {
  massage: 'المساج',
  hammam: 'الحمام المغربي',
  pedicure: 'البديكير',
  manicure: 'المانيكير',
  facial: 'تنظيف البشرة',
  hair_removal: 'إزالة الشعر',
  body_scrub: 'تقشير الجسم',
};

const inventoryThresholds = {
  massage: 10,
  hammam: 10,
  pedicure: 15,
  manicure: 15,
  facial: 10,
  hair_removal: 10,
  body_scrub: 10,
};

const drawerSubmissions = new Map();
const rosterCache = new Map();
const sentShiftNotifications = new Set();
const alreadyAlertedInventory = new Set();
const processedBookingIds = new Set();

function currentShiftKey(date = new Date()) {
  const period = date.getHours() < 12 ? 'AM' : 'PM';
  return `${date.toISOString().slice(0, 10)}_${period}`;
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function computeDiscrepancy(reported, actual) {
  return {
    cashDiff: +(reported.cash - actual.cash).toFixed(2),
    madaDiff: +(reported.mada - actual.mada).toFixed(2),
    creditDiff: +(reported.credit - actual.credit).toFixed(2),
  };
}

function buildConfirmationMessage(booking) {
  const dateTime = new Date(booking.dateTime).toLocaleString('ar-SA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return `تم تأكيد حجزك بنجاح\nالخدمة: ${booking.service}\nالموعد: ${dateTime}\nرقم الحجز: ${booking.bookingId}\nنتشرف بخدمتك!`;
}

async function runCashAudit() {
  const to = new Date();
  const from = new Date(to.getTime() - 12 * 60 * 60 * 1000);
  const shiftKey = currentShiftKey(to);

  let report;
  try {
    report = await glamera.getCashReport({ from: from.toISOString(), to: to.toISOString() });
  } catch (err) {
    return;
  }

  const actual = drawerSubmissions.get(shiftKey);
  if (!actual) {
    await whatsapp.sendMessage(
      SUPERVISOR_WHATSAPP,
      `تذكير: لم يتم إدخال عدّ الدرج الفعلي لوردية ${shiftKey} بعد.`
    );
    return;
  }

  const diff = computeDiscrepancy(report, actual);
  const hasDiscrepancy =
    Math.abs(diff.cashDiff) > CASH_DISCREPANCY_THRESHOLD ||
    Math.abs(diff.madaDiff) > CASH_DISCREPANCY_THRESHOLD ||
    Math.abs(diff.creditDiff) > CASH_DISCREPANCY_THRESHOLD;

  if (hasDiscrepancy) {
    const msg =
      `فرق في مطابقة الكاش - وردية ${shiftKey}\n` +
      `كاش: نظام ${report.cash} فعلي ${actual.cash} فرق ${diff.cashDiff}\n` +
      `مدى: نظام ${report.mada} فعلي ${actual.mada} فرق ${diff.madaDiff}\n` +
      `ائتمان: نظام ${report.credit} فعلي ${actual.credit} فرق ${diff.creditDiff}\n` +
      `مُسلَّم بواسطة: ${actual.submittedBy}`;
    await whatsapp.sendMessage(SUPERVISOR_WHATSAPP, msg);
  }
}

async function syncDepartment(department, date) {
  const { data: staffList } = await glamera.getStaffSchedule({ date, department });
  staffList.forEach((staff) => {
    rosterCache.set(staff.staffId, { ...staff, department });
  });
}

async function runStaffSync() {
  const today = new Date().toISOString().slice(0, 10);
  for (const dept of DEPARTMENTS) {
    try {
      await syncDepartment(dept, today);
    } catch (err) {
      continue;
    }
  }
}

async function checkShifts() {
  const nowTime = nowHHMM();
  const today = new Date().toISOString().slice(0, 10);

  for (const [staffId, staff] of rosterCache.entries()) {
    const deptLabel = DEPARTMENT_LABELS_AR[staff.department] || staff.department;
    const startKey = `${staffId}_start_${today}`;
    const endKey = `${staffId}_end_${today}`;

    if (staff.shiftStart === nowTime && !sentShiftNotifications.has(startKey)) {
      await whatsapp.sendMessage(
        staff.whatsapp,
        `مرحباً ${staff.name}\nنذكّرك ببداية دوامك اليوم في قسم ${deptLabel} الساعة ${staff.shiftStart}.`
      );
      sentShiftNotifications.add(startKey);
    }

    if (staff.shiftEnd === nowTime && !sentShiftNotifications.has(endKey)) {
      await whatsapp.sendMessage(
        staff.whatsapp,
        `مرحباً ${staff.name}\nانتهى دوامك اليوم في قسم ${deptLabel} الساعة ${staff.shiftEnd}. شكراً لجهودك.`
      );
      sentShiftNotifications.add(endKey);
    }
  }
}

async function checkInventory() {
  let items;
  try {
    const { data } = await glamera.getInventory();
    items = data;
  } catch (err) {
    return;
  }

  const lowStockItems = [];

  for (const item of items) {
    const threshold = inventoryThresholds[item.category] ?? 10;
    const isLow = item.quantity <= threshold;
    const alertKey = `${item.category}_${item.item}`;

    if (isLow && !alreadyAlertedInventory.has(alertKey)) {
      lowStockItems.push(item);
      alreadyAlertedInventory.add(alertKey);
    } else if (!isLow && alreadyAlertedInventory.has(alertKey)) {
      alreadyAlertedInventory.delete(alertKey);
    }
  }

  if (lowStockItems.length > 0) {
    const lines = lowStockItems
      .map((i) => `${i.item} (${CATEGORY_LABELS_AR[i.category] || i.category}): متبقي ${i.quantity} ${i.unit}`)
      .join('\n');
    await whatsapp.sendMessage(PURCHASING_WHATSAPP, `تنبيه نقص مخزون:\n${lines}`);
  }
}

async function handleNewBooking(booking) {
  if (!booking || !booking.bookingId) return;
  if (processedBookingIds.has(booking.bookingId)) return;

  processedBookingIds.add(booking.bookingId);
  const message = buildConfirmationMessage(booking);
  await whatsapp.sendMessage(booking.customerPhone, message);
}

async function pollRecentBookings() {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - 5 * 60 * 1000);
    const { data: bookings } = await glamera.getBookings({
      from: from.toISOString(),
      to: to.toISOString(),
      status: 'confirmed',
    });
    for (const booking of bookings) {
      await handleNewBooking(booking);
    }
  } catch (err) {
    return;
  }
}

app.post('/webhooks/glamera/booking-created', async (req, res) => {
  await handleNewBooking(req.body);
  res.status(200).json({ received: true });
});

app.post('/webhooks/whatsapp/incoming', async (req, res) => {
  const parsed = whatsapp.parseIncomingMessage(req.body);
  if (parsed) {
    await whatsapp.analyzeReplyWithAI(parsed);
  }
  res.status(200).json({ received: true });
});

app.get('/webhooks/whatsapp/incoming', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/internal/drawer/submit', (req, res) => {
  const { cash, mada, credit, submittedBy, shiftKey } = req.body;
  if (cash == null || mada == null || credit == null || !submittedBy) {
    return res.status(400).json({ error: 'الحقول المطلوبة: cash, mada, credit, submittedBy' });
  }
  const key = shiftKey || currentShiftKey();
  drawerSubmissions.set(key, { cash, mada, credit, submittedBy, submittedAt: new Date().toISOString() });
  res.json({ success: true, shiftKey: key });
});

app.post('/internal/glamera/simulate-booking', (req, res) => {
  const booking = glamera.simulateNewBooking(req.body || {});
  res.json({ success: true, booking });
});

app.get('/internal/roster', (req, res) => {
  res.json({ data: Array.from(rosterCache.values()) });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', glameraMode: glamera.mode });
});

cron.schedule(CASH_AUDIT_CRON, runCashAudit);
cron.schedule(STAFF_SYNC_CRON, runStaffSync);
cron.schedule('* * * * *', checkShifts);
cron.schedule(INVENTORY_CRON, checkInventory);
cron.schedule('* * * * *', pollRecentBookings);

runStaffSync();

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});
