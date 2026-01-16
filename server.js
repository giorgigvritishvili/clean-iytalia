require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// მონაცემთა ბაზის საქაღალდე
const dataDir = process.env.VERCEL ? '/tmp' : __dirname;
const dataSubDir = path.join(dataDir, 'data');
if (!fs.existsSync(dataSubDir)) {
  fs.mkdirSync(dataSubDir, { recursive: true });
}

// ფაილების გზები
const paths = {
  services: path.join(dataSubDir, 'services.json'),
  cities: path.join(dataSubDir, 'cities.json'),
  bookings: path.join(dataSubDir, 'bookings.json'),
  blockedSlots: path.join(dataSubDir, 'blockedSlots.json'),
  admins: path.join(dataSubDir, 'admins.json'),
  contact: path.join(dataSubDir, 'contact.json')
};

let services = [], cities = [], bookings = [], blockedSlots = [], admins = [];
let contactConfig = { email: 'info@cleanitalia.com', phone: '+39123456789', whatsapp: '+39123456789' };
const adminTokens = new Map();

// Nodemailer კონფიგურაცია
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

app.use(cors({ credentials: true }));
app.use(express.json());
app.use(express.static('public'));

// ქეშირების საწინააღმდეგო Header-ები
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// მონაცემების შენახვის ფუნქცია
function saveData(array, filePath) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(array, null, 2));
  } catch (err) {
    console.error('Failed to save data:', filePath, err);
  }
}

// მონაცემების ჩატვირთვა და საწყისი ინიციალიზაცია
function loadData() {
  try {
    // Services
    if (fs.existsSync(paths.services)) {
      services = JSON.parse(fs.readFileSync(paths.services, 'utf8'));
    } else {
      services = [
        { id: 1, name: 'Regular Cleaning', name_it: 'Pulizia Regolare', name_ru: 'Регулярная уборка', name_ka: 'რეგულარული დასუფავება', price_per_hour: 18.90, enabled: true },
        { id: 2, name: 'Deep Cleaning', name_it: 'Pulizia Profonda', name_ru: 'Глубокая уборка', name_ka: 'ღრმა დასუფავება', price_per_hour: 25.90, enabled: true },
        { id: 3, name: 'Move-in/out', name_it: 'Trasloco', name_ru: 'Въезд/выезд', name_ka: 'შესვლა/გასვლა', price_per_hour: 25.90, enabled: true }
      ];
      saveData(services, paths.services);
    }

    // Cities
    if (fs.existsSync(paths.cities)) {
      cities = JSON.parse(fs.readFileSync(paths.cities, 'utf8'));
    } else {
      cities = [
        { id: 1, name: 'Rome', name_it: 'Roma', name_ka: 'რომი', enabled: true, working_days: '1,2,3,4,5,6,7', working_hours_start: '09:00', working_hours_end: '17:30' },
        { id: 2, name: 'Milan', name_it: 'Milano', name_ka: 'მილანი', enabled: true, working_days: '1,2,3,4,5,6,7', working_hours_start: '09:00', working_hours_end: '17:30' }
      ];
      saveData(cities, paths.cities);
    }

    // Bookings, Blocked Slots, Contact
    if (fs.existsSync(paths.bookings)) bookings = JSON.parse(fs.readFileSync(paths.bookings, 'utf8'));
    if (fs.existsSync(paths.blockedSlots)) blockedSlots = JSON.parse(fs.readFileSync(paths.blockedSlots, 'utf8'));
    if (fs.existsSync(paths.contact)) contactConfig = JSON.parse(fs.readFileSync(paths.contact, 'utf8'));

    // Admins
    if (fs.existsSync(paths.admins)) {
      admins = JSON.parse(fs.readFileSync(paths.admins, 'utf8'));
    } else {
      const adminPassword = process.env.ADMIN_PASSWORD || 'CasaClean2026';
      const hashedPassword = bcrypt.hashSync(adminPassword, 10);
      admins = [{ id: 1, username: 'CasaClean', password_hash: hashedPassword }];
      saveData(admins, paths.admins);
    }
  } catch (err) {
    console.error('Data loading error:', err);
  }
}
loadData();

// --- STRIPE & PAYMENTS ---

app.get('/api/stripe/config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

app.post('/api/create-payment-intent', async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
    const { amount } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(parseFloat(amount) * 100),
      currency: 'eur',
      capture_method: 'manual',
    });
    res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- BOOKINGS ---

app.post('/api/bookings', async (req, res) => {
  try {
    const data = req.body;
    const newId = bookings.length > 0 ? Math.max(...bookings.map(b => b.id)) + 1 : 1;
    const newBooking = {
      id: newId,
      ...data,
      status: 'pending',
      stripe_status: 'authorized',
      created_at: new Date().toISOString()
    };

    bookings.push(newBooking);
    saveData(bookings, paths.bookings);

    // იმეილის გაგზავნა
    try {
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: data.customerEmail,
        subject: 'Booking Received - CasaClean',
        html: `<h2>Thank you for your booking, ${data.customerName}!</h2><p>Date: ${data.bookingDate} at ${data.bookingTime}</p>`
      });
    } catch (e) { console.log('Email error skipped'); }

    res.json(newBooking);
  } catch (error) {
    res.status(500).json({ error: 'Booking failed' });
  }
});

// --- ADMIN CORE ---

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const admin = admins.find(a => a.username === username);
  if (admin && await bcrypt.compare(password, admin.password_hash)) {
    const token = crypto.randomBytes(32).toString('hex');
    adminTokens.set(token, admin.id);
    return res.json({ success: true, token });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !adminTokens.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const detailed = bookings.map(b => ({
    ...b,
    service_name: services.find(s => s.id == b.serviceId)?.name || '',
    city_name: cities.find(c => c.id == b.cityId)?.name || ''
  }));
  res.json(detailed);
});

app.post('/api/admin/bookings/:id/confirm', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const booking = bookings.find(b => b.id == id);
    if (!booking) return res.status(404).json({ error: 'Not found' });

    if (stripe && booking.paymentIntentId && !booking.paymentIntentId.startsWith('demo_')) {
      await stripe.paymentIntents.capture(booking.paymentIntentId);
    }

    booking.status = 'confirmed';
    booking.stripe_status = 'captured';
    saveData(bookings, paths.bookings);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SLOTS & SETTINGS ---

app.get('/api/available-slots', (req, res) => {
  const { cityId, date } = req.query;
  const city = cities.find(c => c.id == cityId);
  if (!city) return res.status(404).json({ error: 'City not found' });

  const blocked = blockedSlots.filter(s => s.city_id == cityId && s.blocked_date === date).map(s => s.blocked_time);
  const start = parseInt(city.working_hours_start);
  const end = parseInt(city.working_hours_end);
  
  let slots = [];
  for (let i = start; i < end; i++) {
    const t = `${i.toString().padStart(2, '0')}:00`;
    if (!blocked.includes(t + ':00')) slots.push(t);
  }
  res.json({ slots });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const stats = {
    totalBookings: bookings.length,
    pendingBookings: bookings.filter(b => b.status === 'pending').length,
    confirmedBookings: bookings.filter(b => b.status === 'confirmed').length,
    totalRevenue: bookings.filter(b => b.status === 'confirmed').reduce((s, b) => s + parseFloat(b.totalAmount || 0), 0)
  };
  res.json(stats);
});

// Static Files & Start
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, '0.0.0.0', () => console.log(`Server started at http://localhost:${PORT}`));
}