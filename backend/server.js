require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const driversRoutes = require('./routes/drivers');
const locationRoutes = require('./routes/location');
const reportsRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const ordersRoutes = require('./routes/orders');
const performanceRoutes = require('./routes/performance');
const messagesRoutes = require('./routes/messages');
const leaveRoutes = require('./routes/leave');
const attachmentsRoutes = require('./routes/attachments');
const workHoursRoutes = require('./routes/workhours');
const dailyNotesRoutes = require('./routes/dailynotes');
const announcementsRoutes = require('./routes/announcements');
const { initLiveTracking } = require('./sockets/liveTracking');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/drivers', driversRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/attachments', attachmentsRoutes);
app.use('/api/workhours', workHoursRoutes);
app.use('/api/dailynotes', dailyNotesRoutes);
app.use('/api/announcements', announcementsRoutes);

initLiveTracking(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ خادم نهج للتوصيل يعمل على المنفذ ${PORT}`);
});
