const express = require('express');
const glameraAdapter = require('./glameraadapter');
const whatsappAdapter = require('./whatsappAdapter');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

console.log('🚀 تم تشغيل نظام وكلاء مرادي سبأ لإدارة الـ 24 ساعة...');

app.post('/webhook/glamera', (req, res) => {
    const data = req.body;
    console.log('📥 إشارة مستلمة من جلاميرا:', data.event);
    
    if (data.event === 'booking_created') {
        whatsappAdapter.sendBookingNotification(data.appointment);
    }
    res.status(200).json({ success: true, message: 'Glamera data synced' });
});

app.post('/webhook/whatsapp/receive', (req, res) => {
    const { from, message } = req.body;
    console.log(`💬 رسالة واردة من الاستقبال أو الموظف (${from}): ${message}`);
    
    if (message.includes('تقفيل الكاش') || message.includes('وردية')) {
        console.log('🤖 وكيل تدقيق الكاش والورديات يقوم بمطابقة الأرقام الآن...');
        const financeReport = glameraAdapter.getFinanceReportMock();
        
        whatsappAdapter.sendSystemAlert(`إشعار من وكيل الكاش: تم استلام طلب تقفيل الوردية. مطابقة جلاميرا: كاش (${financeReport.cash})، مدى (${financeReport.mada})، فيزا (${financeReport.credit}).`);
    }
    res.status(200).json({ success: true });
});

app.get('/api/trigger-staff-schedule', (req, res) => {
    const schedule = glameraAdapter.getStaffScheduleMock();
    schedule.forEach(employee => {
        whatsappAdapter.sendStaffShiftReminder(employee);
    });
    res.status(200).json({ success: true, message: 'Sent schedules to all 7 services staff' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
