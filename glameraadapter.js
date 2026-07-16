3. glameraAdapter.js
const axios = require('axios');

const GLAMERA_MODE = process.env.GLAMERA_MODE || 'mock';
const GLAMERA_BASE_URL = process.env.GLAMERA_BASE_URL || '';
const GLAMERA_API_KEY = process.env.GLAMERA_API_KEY || '';
const GLAMERA_BRANCH_ID = process.env.GLAMERA_BRANCH_ID || 'saba-branch-001';

const client = axios.create({
  baseURL: GLAMERA_BASE_URL,
  timeout: 15000,
  headers: {
    Authorization: `Bearer ${GLAMERA_API_KEY}`,
    'Content-Type': 'application/json',
    'X-Branch-Id': GLAMERA_BRANCH_ID,
  },
});

const ENDPOINTS = {
  CASH_REPORT: '/reports/payments',
  STAFF_SCHEDULE: '/staff/schedule',
  STAFF_PROFILE: '/staff/:staffId',
  INVENTORY: '/inventory',
  BOOKINGS: '/bookings',
  BOOKING_BY_ID: '/bookings/:bookingId',
};

const mockStaff = [
  { staffId: 'S001', name: 'منى عبدالله', department: 'massage', whatsapp: '9665XXXXXXX1', shiftStart: '10:00', shiftEnd: '18:00' },
  { staffId: 'S002', name: 'سارة الحربي', department: 'hammam', whatsapp: '9665XXXXXXX2', shiftStart: '11:00', shiftEnd: '19:00' },
  { staffId: 'S003', name: 'ريم القحطاني', department: 'pedicure', whatsapp: '9665XXXXXXX3', shiftStart: '10:00', shiftEnd: '18:00' },
  { staffId: 'S004', name: 'لينا الشمري', department: 'facial', whatsapp: '9665XXXXXXX4', shiftStart: '12:00', shiftEnd: '20:00' },
];

const mockInventory = [
  { category: 'massage', item: 'زيت مساج', quantity: 8, unit: 'زجاجة' },
  { category: 'hammam', item: 'صابون أسود', quantity: 25, unit: 'علبة' },
  { category: 'pedicure', item: 'مقشر أقدام', quantity: 4, unit: 'علبة' },
  { category: 'manicure', item: 'مزيل طلاء', quantity: 20, unit: 'زجاجة' },
  { category: 'facial', item: 'ماسك تنظيف بشرة', quantity: 6, unit: 'علبة' },
  { category: 'hair_removal', item: 'شمع إزالة الشعر', quantity: 12, unit: 'كيلو' },
  { category: 'body_scrub', item: 'مقشر جسم', quantity: 9, unit: 'علبة' },
];

let mockBookings = [
  {
    bookingId: 'B1001',
    customerName: 'عبير سالم',
    customerPhone: '9665XXXXXXX9',
    service: 'مساج استرخائي',
    staffId: 'S001',
    dateTime: new Date().toISOString(),
    status: 'confirmed',
  },
];

const mockCashReport = {
  cash: 4250.5,
  mada: 6870.0,
  credit: 1200.0,
  totalTransactions: 63,
};

async function request(method, path, options = {}) {
  const response = await client.request({ method, url: path, params: options.params, data: options.data });
  return response.data;
}

async function getCashReport({ from, to }) {
  if (GLAMERA_MODE === 'mock') {
    return { ...mockCashReport, from, to };
  }
  return request('GET', ENDPOINTS.CASH_REPORT, { params: { from, to, branchId: GLAMERA_BRANCH_ID } });
}

async function getStaffSchedule({ date, department }) {
  if (GLAMERA_MODE === 'mock') {
    const data = department ? mockStaff.filter((s) => s.department === department) : mockStaff;
    return { data };
  }
  return request('GET', ENDPOINTS.STAFF_SCHEDULE, { params: { date, department, branchId: GLAMERA_BRANCH_ID } });
}

async function getStaffProfile(staffId) {
  if (GLAMERA_MODE === 'mock') {
    return mockStaff.find((s) => s.staffId === staffId) || null;
  }
  return request('GET', ENDPOINTS.STAFF_PROFILE.replace(':staffId', staffId));
}

async function getInventory({ category } = {}) {
  if (GLAMERA_MODE === 'mock') {
    const data = category ? mockInventory.filter((i) => i.category === category) : mockInventory;
    return { data };
  }
  return request('GET', ENDPOINTS.INVENTORY, { params: { category, branchId: GLAMERA_BRANCH_ID } });
}

async function getBookings({ from, to, status } = {}) {
  if (GLAMERA_MODE === 'mock') {
    return { data: mockBookings };
  }
  return request('GET', ENDPOINTS.BOOKINGS, { params: { from, to, status, branchId: GLAMERA_BRANCH_ID } });
}

async function getBookingById(bookingId) {
  if (GLAMERA_MODE === 'mock') {
    return mockBookings.find((b) => b.bookingId === bookingId) || null;
  }
  return request('GET', ENDPOINTS.BOOKING_BY_ID.replace(':bookingId', bookingId));
}

function simulateNewBooking({ customerName, customerPhone, service, staffId }) {
  const newBooking = {
    bookingId: `B${1000 + mockBookings.length + 1}`,
    customerName: customerName || 'عميلة تجريبية',
    customerPhone: customerPhone || '9665XXXXXXX0',
    service: service || 'خدمة تجريبية',
    staffId: staffId || 'S001',
    dateTime: new Date().toISOString(),
    status: 'confirmed',
  };
  mockBookings.push(newBooking);
  return newBooking;
}

module.exports = {
  mode: GLAMERA_MODE,
  getCashReport,
  getStaffSchedule,
  getStaffProfile,
  getInventory,
  getBookings,
  getBookingById,
  simulateNewBooking,
};
