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


const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
if (!stripe) {
  console.warn('Stripe is not configured. Payments will be simulated.');
}
// Data directory (use /tmp on Vercel for writable storage)
const _vercelEnv = String(process.env.VERCEL || '').toLowerCase();
const isVercel = _vercelEnv === '1' || _vercelEnv === 'true';
const dataDir = isVercel ? '/tmp' : __dirname;

// Data file paths
const servicesFilePath = path.join(dataDir, 'data', 'services.json');
const citiesFilePath = path.join(dataDir, 'data', 'cities.json');
const bookingsFilePath = path.join(dataDir, 'data', 'bookings.json');
const blockedSlotsFilePath = path.join(dataDir, 'data', 'blockedSlots.json');
const adminsFilePath = path.join(dataDir, 'data', 'admins.json');
const workersFilePath = path.join(dataDir, 'data', 'workers.json');
const tokensFilePath = path.join(dataDir, 'data', 'tokens.json');

// Load data from files
let services = [];
let cities = [];
let bookings = [];
let blockedSlots = [];
let admins = [];
let workers = [];

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
app.use(express.static(path.join(__dirname, 'public')));

let adminTokens = {}; // token -> adminId

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Contact configuration (persisted to data/contact.json)
const contactFilePath = path.join(dataDir, 'data', 'contact.json');
let contactConfig = { email: 'info@cleanitalia.com', phone: '+39123456789', whatsapp: '+39123456789' };
try {
  if (fs.existsSync(contactFilePath)) {
    const raw = fs.readFileSync(contactFilePath, 'utf8');
    contactConfig = JSON.parse(raw);
  } else {
    // ensure directory exists
    fs.mkdirSync(path.dirname(contactFilePath), { recursive: true });
    fs.writeFileSync(contactFilePath, JSON.stringify(contactConfig, null, 2));
  }
} catch (err) {
  console.error('Failed to load contact config:', err);
}

function loadData() {
  // Load services from file if exists, else use defaults and save
  try {
    if (fs.existsSync(servicesFilePath)) {
      services = JSON.parse(fs.readFileSync(servicesFilePath, 'utf8'));
    } else {
      services = [
        { id: 1, name: 'Regular Cleaning', name_it: 'Pulizia Regolare', name_ru: 'Регулярная уборка', name_ka: 'რეგულარული დასუფთავება', description: 'Weekly or bi-weekly cleaning for homes', description_it: 'Pulizia settimanale o bisettimanale per case', description_ru: 'Еженедельная или двухнедельная уборка для домов', description_ka: 'კვირაში ან ორჯერ კვირაში დასუფთავება სახლებისთვის', price_per_hour: 18.90, enabled: true },
        { id: 2, name: 'One-time Cleaning', name_it: 'Pulizia Una Tantum', name_ru: 'Разовая уборка', name_ka: 'ერთჯერადი დასუფთავება', description: 'Single deep clean for any occasion', description_it: 'Una pulizia approfondita per qualsiasi occasione', description_ru: 'Однократная глубокая уборка для любого случая', description_ka: 'ერთჯერადი ღრმა დასუფთავება ნებისმიერი შემთხვევისთვის', price_per_hour: 21.90, enabled: true },
        { id: 3, name: 'Deep Cleaning', name_it: 'Pulizia Profonda', name_ru: 'Глубокая уборка', name_ka: 'ღრმა დასუფთავება', description: 'Thorough cleaning including hard-to-reach areas', description_it: 'Pulizia accurata incluse le aree difficili da raggiungere', description_ru: 'Тщательная уборка, включая труднодоступные места', description_ka: 'სრულყოფილი დასუფთავება მათ შორის რთულად მისაწვდომ ადგილებში', price_per_hour: 25.90, enabled: true },
        { id: 4, name: 'Move-in/Move-out', name_it: 'Trasloco', name_ru: 'Въезд/выезд', name_ka: 'შესვლა/გასვლა', description: 'Complete cleaning for moving in or out', description_it: 'Pulizia completa per traslochi', description_ru: 'Полная уборка для въезда или выезда', description_ka: 'სრული დასუფთავება შესვლის ან გასვლისთვის', price_per_hour: 25.90, enabled: true },
        { id: 5, name: 'Last-minute Cleaning', name_it: 'Pulizia Last Minute', name_ru: 'Срочная уборка', name_ka: 'ბოლო წუთის დასუფთავება', description: 'Urgent cleaning service within 24 hours', description_it: 'Servizio di pulizia urgente entro 24 ore', description_ru: 'Срочная услуга уборки в течение 24 часов', description_ka: 'სასწრაფო დასუფთავების სერვისი 24 საათის განმავლობაში', price_per_hour: 31.90, enabled: true },
        { id: 6, name: 'Business Cleaning', name_it: 'Pulizia Uffici', name_ru: 'Уборка офисов', name_ka: 'კომერციული დასუფთავება', description: 'Professional cleaning for offices and businesses', description_it: 'Pulizia professionale per uffici e aziende', description_ru: 'Профессиональная уборка для офисов и предприятий', description_ka: 'პროფესიონალური დასუფთავება ოფისებისა და ბიზნესისთვის', price_per_hour: 35.00, enabled: true }
      ];
      saveData(services, servicesFilePath);
    }
  } catch (err) {
    console.error('Failed to load services:', err);
  }

  // Load cities from file if exists, else use defaults and save
  try {
    if (fs.existsSync(citiesFilePath)) {
      cities = JSON.parse(fs.readFileSync(citiesFilePath, 'utf8'));
    } else {
      cities = [
        { id: 1, name: 'Rome', name_it: 'Roma', name_ru: 'Рим', name_ka: 'რომი', enabled: true, working_days: '1,2,3,4,5,6,7', working_hours_start: '09:00', working_hours_end: '17:30' },
        { id: 2, name: 'Milan', name_it: 'Milano', name_ru: 'Милан', name_ka: 'მილანი', enabled: true, working_days: '1,2,3,4,5,6,7', working_hours_start: '09:00', working_hours_end: '17:30' }
      ];
      saveData(cities, citiesFilePath);
    }
  } catch (err) {
    console.error('Failed to load cities:', err);
  }

  try {
    if (fs.existsSync(bookingsFilePath)) {
      bookings = JSON.parse(fs.readFileSync(bookingsFilePath, 'utf8'));
    } else {
      bookings = [];
      fs.writeFileSync(bookingsFilePath, JSON.stringify(bookings, null, 2));
    }
  } catch (err) {
    console.error('Failed to load bookings:', err);
  }

  try {
    if (fs.existsSync(blockedSlotsFilePath)) {
      blockedSlots = JSON.parse(fs.readFileSync(blockedSlotsFilePath, 'utf8'));
    } else {
      blockedSlots = [];
      fs.writeFileSync(blockedSlotsFilePath, JSON.stringify(blockedSlots, null, 2));
    }
  } catch (err) {
    console.error('Failed to load blocked slots:', err);
  }

  try {
    if (fs.existsSync(adminsFilePath)) {
      admins = JSON.parse(fs.readFileSync(adminsFilePath, 'utf8'));
    } else {
      const adminPassword = process.env.ADMIN_PASSWORD || 'CasaClean2026';
      const hashedPassword = bcrypt.hashSync(adminPassword, 10);
      admins = [{ id: 1, username: 'CasaClean', password_hash: hashedPassword }];
      saveData(admins, adminsFilePath);
    }
  } catch (err) {
    console.error('Failed to load admins:', err);
  }

  if (services.length === 0) {
    services = [
        { id: 1, name: 'Regular Cleaning', name_it: 'Pulizia Regolare', name_ru: 'Регулярная уборка', name_ka: 'რეგულარული დასუფთავება', description: 'Weekly or bi-weekly cleaning for homes', description_it: 'Pulizia settimanale o bisettimanale per case', description_ru: 'Еженедельная или двухнедельная уборка для домов', description_ka: 'კვირაში ან ორჯერ კვირაში დასუფთავება სახლებისთვის', price_per_hour: 18.90, enabled: true },
        { id: 2, name: 'One-time Cleaning', name_it: 'Pulizia Una Tantum', name_ru: 'Разовая уборка', name_ka: 'ერთჯერადი დასუფთავება', description: 'Single deep clean for any occasion', description_it: 'Una pulizia approfondita per qualsiasi occasione', description_ru: 'Однократная глубокая уборка для любого случая', description_ka: 'ერთჯერადი ღრმა დასუფთავება ნებისმიერი შემთხვევისთვის', price_per_hour: 21.90, enabled: true },
        { id: 3, name: 'Deep Cleaning', name_it: 'Pulizia Profonda', name_ru: 'Глубокая уборка', name_ka: 'ღრმა დასუფთავება', description: 'Thorough cleaning including hard-to-reach areas', description_it: 'Pulizia accurata incluse le aree difficili da raggiungere', description_ru: 'Тщательная уборка, включая труднодоступные места', description_ka: 'სრულყოფილი დასუფთავება მათ შორის რთულად მისაწვდომ ადგილებში', price_per_hour: 25.90, enabled: true },
        { id: 4, name: 'Move-in/Move-out', name_it: 'Trasloco', name_ru: 'Въезд/выезд', name_ka: 'შესვლა/გასვლა', description: 'Complete cleaning for moving in or out', description_it: 'Pulizia completa per traslochi', description_ru: 'Полная уборка для въезда или выезда', description_ka: 'სრული დასუფთავება შესვლის ან გასვლისთვის', price_per_hour: 25.90, enabled: true },
        { id: 5, name: 'Last-minute Cleaning', name_it: 'Pulizia Last Minute', name_ru: 'Срочная уборка', name_ka: 'ბოლო წუთის დასუფთავება', description: 'Urgent cleaning service within 24 hours', description_it: 'Servizio di pulizia urgente entro 24 ore', description_ru: 'Срочная услуга уборки в течение 24 часов', description_ka: 'სასწრაფო დასუფთავების სერვისი 24 საათის განმავლობაში', price_per_hour: 31.90, enabled: true },
        { id: 6, name: 'Business Cleaning', name_it: 'Pulizia Uffici', name_ru: 'Уборка офисов', name_ka: 'კომერციული დასუფთავება', description: 'Professional cleaning for offices and businesses', description_it: 'Pulizia professionale per uffici e aziende', description_ru: 'Профессиональная уборка для офисов и предприятий', description_ka: 'პროფესიონალური დასუფთავება ოფისებისა და ბიზნესისთვის', price_per_hour: 35.00, enabled: true }
    ];
    saveData(services, servicesFilePath);
  }
  if (cities.length === 0) {
    cities = [
        { id: 1, name: 'Rome', name_it: 'Roma', name_ru: 'Рим', name_ka: 'რომი', enabled: true, working_days: '1,2,3,4,5,6,7', working_hours_start: '09:00', working_hours_end: '17:30' },
        { id: 2, name: 'Milan', name_it: 'Milano', name_ru: 'Милан', name_ka: 'Милан', name_ka: 'მილანი', enabled: true, working_days: '1,2,3,4,5,6,7', working_hours_start: '09:00', working_hours_end: '17:30' }
    ];
    saveData(cities, citiesFilePath);
  }

  try {
    if (fs.existsSync(workersFilePath)) {
      workers = JSON.parse(fs.readFileSync(workersFilePath, 'utf8'));
    } else {
      workers = [
        {
          "id": 1,
          "name": "Mario Rossi",
          "email": "mario@example.com",
          "phone": "+39 123 456 789",
          "specialties": ["Regular Cleaning", "Deep Cleaning"],
          "rating": 4.8,
          "completed_jobs": 45,
          "active": true,
          "created_at": "2024-01-15"
        },
        {
          "id": 2,
          "name": "Giulia Bianchi",
          "email": "giulia@example.com",
          "phone": "+39 987 654 321",
          "specialties": ["Move-in/Move-out", "Regular Cleaning"],
          "rating": 4.9,
          "completed_jobs": 32,
          "active": true,
          "created_at": "2024-02-01"
        }
      ];
      saveData(workers, workersFilePath);
    }
  } catch (err) {
    console.error('Failed to load workers:', err);
  }

  try {
    if (fs.existsSync(tokensFilePath)) {
      adminTokens = JSON.parse(fs.readFileSync(tokensFilePath, 'utf8'));
    } else {
      adminTokens = {};
      saveData(adminTokens, tokensFilePath);
    }
  } catch (err) {
    console.error('Failed to load tokens:', err);
  }
}

function saveData(array, filePath) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(array, null, 2));
    console.log(`Saved data to ${filePath} (items: ${array && array.length ? array.length : 0})`);
    return true;
  } catch (err) {
    console.error(`Failed to save data to ${filePath}:`, err);
    return false;
  }
}

// Load data on startup
loadData();

app.get('/api/contact', (req, res) => {
  res.json(contactConfig);
});

app.post('/api/admin/contact', (req, res) => {
  try {
    const { email, phone, whatsapp } = req.body;
    contactConfig = { email: email || '', phone: phone || '', whatsapp: whatsapp || '' };
    fs.writeFileSync(contactFilePath, JSON.stringify(contactConfig, null, 2));
    res.json({ success: true, contact: contactConfig });
  } catch (err) {
    console.error('Failed to save contact config:', err);
    res.status(500).json({ error: 'Failed to save contact config' });
  }
});

// Initialize admin password hash
(async () => {
  const adminPassword = process.env.ADMIN_PASSWORD || 'CasaClean2026';
  admins[0].password_hash = await bcrypt.hash(adminPassword, 10);
})();

app.get('/api/cities', (req, res) => {
  try {
    const enabledCities = cities.filter(city => city.enabled).sort((a, b) => a.name.localeCompare(b.name));
    res.json(enabledCities);
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

app.get('/api/services', (req, res) => {
  try {
    const enabledServices = services.filter(service => service.enabled).sort((a, b) => a.name.localeCompare(b.name));
    res.json(enabledServices);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

app.get('/api/available-slots', (req, res) => {
  try {
    const { cityId, date } = req.query;

    const city = cities.find(c => c.id == cityId);
    if (!city) {
      return res.status(404).json({ error: 'City not found' });
    }

    const requestDate = new Date(date);
    const dayOfWeek = requestDate.getDay() || 7;

    if (!city.working_days.split(',').includes(dayOfWeek.toString())) {
      return res.json({ slots: [], message: 'Not a working day' });
    }

    const blockedTimes = blockedSlots
      .filter(slot => slot.city_id == cityId && slot.blocked_date === date)
      .map(slot => slot.blocked_time);

    const startHour = parseInt(city.working_hours_start.split(':')[0]);
    const endHour = parseInt(city.working_hours_end.split(':')[0]);

    const slots = [];
    for (let hour = startHour; hour < endHour; hour++) {
      const timeStr = `${hour.toString().padStart(2, '0')}:00:00`;
      if (!blockedTimes.includes(timeStr)) {
        slots.push(`${hour.toString().padStart(2, '0')}:00`);
      }
    }

    res.json({ slots });
  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).json({ error: 'Failed to fetch available slots' });
  }
});

app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'eur' } = req.body;

    console.log(`Attempting to create payment for: ${amount} ${currency}`);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // ცენტებში გადაყვანა
      currency,
      payment_method_types: ['card'],
      capture_method: 'manual',
    });

    console.log('Payment Intent created successfully:', paymentIntent.id);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Stripe Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const {
      serviceId, cityId, customerName, customerEmail, customerPhone,
      streetName, houseNumber, propertySize, doorbellName,
      bookingDate, bookingTime, hours, cleaners,
      totalAmount, paymentIntentId, notes, additionalServices, supplies
    } = req.body;

    const newId = bookings.length > 0 ? Math.max(...bookings.map(b => b.id)) + 1 : 1;
    const newBooking = {
      id: newId,
      service_id: serviceId,
      city_id: cityId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      street_name: streetName,
      house_number: houseNumber,
      property_size: propertySize,
      doorbell_name: doorbellName,
      booking_date: bookingDate,
      booking_time: bookingTime,
      hours,
      cleaners,
      total_amount: totalAmount,
      payment_intent_id: paymentIntentId,
      notes,
      additional_services: additionalServices || [],
      supplies: supplies || [],
      status: 'pending',
      stripe_status: 'authorized',
      created_at: new Date().toISOString()
    };

    // Attempt to persist bookings safely
    const tentative = bookings.concat(newBooking);
    const saved = saveData(tentative, bookingsFilePath);
    if (!saved) {
      console.error(`Failed to persist booking ${newBooking.id} to ${bookingsFilePath}`);
      return res.status(500).json({ error: 'Failed to save booking' });
    }
    bookings = tentative;
    console.log(`Booking ${newBooking.id} created and persisted to ${bookingsFilePath}`);

    try {
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: customerEmail,
        subject: 'Booking Pending Confirmation - CasaClean',
        html: `
          <h2>Thank you for your booking!</h2>
          <p>Dear ${customerName},</p>
          <p>Your booking is pending confirmation. We will notify you once it's confirmed.</p>
          <p><strong>Details:</strong></p>
          <ul>
            <li>Date: ${bookingDate}</li>
            <li>Time: ${bookingTime}</li>
            <li>Duration: ${hours} hours</li>
            <li>Total: €${totalAmount}</li>
          </ul>
          <p>Your payment has been authorized and will only be charged upon confirmation.</p>
          <p>Best regards,<br>CasaClean Team</p>
        `
      });
    } catch (emailError) {
      console.log('Email sending skipped:', emailError.message);
    }

    res.json(newBooking);
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = admins.find(a => a.username === username);

    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, admin.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    adminTokens[token] = admin.id;
    saveData(adminTokens, tokensFilePath);
    res.json({ success: true, message: 'Login successful', token });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    delete adminTokens[token];
    saveData(adminTokens, tokensFilePath);
  }
  res.json({ success: true });
});

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !adminTokens[token]) {
    console.warn(`Unauthorized admin access attempt from ${req.ip} to ${req.originalUrl}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // attach admin id for auditing in routes
  req.adminId = adminTokens[token];
  next();
}

app.get('/api/admin/bookings', (req, res) => {
  try {
    const bookingsWithDetails = bookings.map(booking => {
      const service = services.find(s => Number(s.id) === Number(booking.service_id));
      const city = cities.find(c => Number(c.id) === Number(booking.city_id));
      return {
        ...booking,
        service_name: service ? service.name : '',
        service_name_it: service ? service.name_it : '',
        city_name: city ? city.name : '',
        city_name_it: city ? city.name_it : ''
      };
    });
    res.json(bookingsWithDetails);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

app.post('/api/admin/bookings/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const bookingIndex = bookings.findIndex(b => b.id == id);

    if (bookingIndex === -1) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookings[bookingIndex];

    // Attempt to capture the PaymentIntent when Stripe is configured
    let captureSucceeded = false;
    if (booking.payment_intent_id && stripe && !String(booking.payment_intent_id).startsWith('demo_')) {
      try {
        const captured = await stripe.paymentIntents.capture(booking.payment_intent_id);
        if (captured && captured.status === 'succeeded') {
          captureSucceeded = true;
        } else {
          console.error('Unexpected Stripe capture status:', captured && captured.status);
          return res.status(502).json({ error: 'Stripe capture failed. Status: ' + (captured ? captured.status : 'unknown') });
        }
      } catch (stripeError) {
        console.error('Stripe capture error:', stripeError);
        return res.status(502).json({ error: 'Stripe capture failed: ' + stripeError.message });
      }
    } else {
      // No payment intent attached - treat as confirmed without payment
      captureSucceeded = true;
    }

    if (!captureSucceeded) {
      return res.status(502).json({ error: 'Failed to capture payment. Booking remains pending.' });
    }

    bookings[bookingIndex].status = 'confirmed';
    bookings[bookingIndex].stripe_status = 'captured';
    bookings[bookingIndex].updated_at = new Date().toISOString();
    saveData(bookings, bookingsFilePath);

    try {
      const additionalServicesList = booking.additional_services && booking.additional_services.length > 0
        ? `<li>Additional Services: ${booking.additional_services.join(', ')}</li>`
        : '';
      const suppliesList = booking.supplies && booking.supplies.length > 0
        ? `<li>Supplies Provided: ${booking.supplies.join(', ')}</li>`
        : '';

      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: booking.customer_email,
        subject: 'Booking Confirmed - CasaClean',
        html: `
          <h2>Your booking is confirmed!</h2>
          <p>Dear ${booking.customer_name},</p>
          <p>Great news! Your cleaning service booking has been confirmed.</p>
          <p><strong>Details:</strong></p>
          <ul>
            <li>Date: ${booking.booking_date}</li>
            <li>Time: ${booking.booking_time}</li>
            <li>Duration: ${booking.hours} hours</li>
            <li>Address: ${booking.street_name} ${booking.house_number}${booking.doorbell_name ? ', ' + booking.doorbell_name : ''}</li>
            <li>Property Size: ${booking.property_size} sqm</li>
            ${additionalServicesList}
            ${suppliesList}
            <li>Total: €${booking.total_amount}</li>
          </ul>
          <p>Your payment has been processed.</p>
          <p>Best regards,<br>CasaClean Team</p>
        `
      });
    } catch (emailError) {
      console.log('Email sending skipped:', emailError.message);
    }

    res.json({ success: true, message: 'Booking confirmed' });
  } catch (error) {
    console.error('Error confirming booking:', error);
    res.status(500).json({ error: 'Failed to confirm booking' });
  }
});

app.post('/api/admin/bookings/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const bookingIndex = bookings.findIndex(b => b.id == id);

    if (bookingIndex === -1) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookings[bookingIndex];

    // Attempt to cancel the PaymentIntent when Stripe is configured
    let cancelSucceeded = false;
    if (booking.payment_intent_id) {
      if (stripe && !String(booking.payment_intent_id).startsWith('demo_')) {
        try {
          await stripe.paymentIntents.cancel(booking.payment_intent_id);
          cancelSucceeded = true;
        } catch (stripeError) {
          console.error('Stripe cancel error:', stripeError);
          return res.status(502).json({ error: 'Stripe cancel failed' });
        }
      } else {
        // demo mode or no stripe configured - treat as succeeded for local/demo flows
        cancelSucceeded = true;
      }
    } else {
      // No payment intent attached - nothing to cancel
      cancelSucceeded = true;
    }

    if (!cancelSucceeded) {
      return res.status(502).json({ error: 'Failed to cancel payment' });
    }

    bookings[bookingIndex].status = 'cancelled';
    bookings[bookingIndex].stripe_status = 'released';
    bookings[bookingIndex].updated_at = new Date().toISOString();
    saveData(bookings, bookingsFilePath);

    try {
      const additionalServicesList = booking.additional_services && booking.additional_services.length > 0
        ? `<li>Additional Services: ${booking.additional_services.join(', ')}</li>`
        : '';
      const suppliesList = booking.supplies && booking.supplies.length > 0
        ? `<li>Supplies Provided: ${booking.supplies.join(', ')}</li>`
        : '';

      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: booking.customer_email,
        subject: 'Booking Rejected - CasaClean',
        html: `
          <h2>Booking Update</h2>
          <p>Dear ${booking.customer_name},</p>
          <p>Unfortunately, we were unable to confirm your booking for ${booking.booking_date}.</p>
          <p><strong>Booking Details:</strong></p>
          <ul>
            <li>Date: ${booking.booking_date}</li>
            <li>Time: ${booking.booking_time}</li>
            <li>Duration: ${booking.hours} hours</li>
            <li>Address: ${booking.street_name} ${booking.house_number}${booking.doorbell_name ? ', ' + booking.doorbell_name : ''}</li>
            <li>Property Size: ${booking.property_size} sqm</li>
            ${additionalServicesList}
            ${suppliesList}
            <li>Total: €${booking.total_amount}</li>
          </ul>
          <p>The authorized payment has been released and will be returned to your card.</p>
          <p>Please feel free to book another time that works for you.</p>
          <p>Best regards,<br>CasaClean Team</p>
        `
      });
    } catch (emailError) {
      console.log('Email sending skipped:', emailError.message);
    }

    res.json({ success: true, message: 'Booking rejected' });
  } catch (error) {
    console.error('Error rejecting booking:', error);
    res.status(500).json({ error: 'Failed to reject booking' });
  }
});

app.post('/api/admin/bookings/:id/manual-pay', async (req, res) => {
  try {
    const { id } = req.params;
    const bookingIndex = bookings.findIndex(b => b.id == id);

    if (bookingIndex === -1) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookings[bookingIndex];

    if (booking.status === 'confirmed') {
      return res.status(400).json({ error: 'Booking is already confirmed' });
    }

    // Mark as manually paid and confirmed
    bookings[bookingIndex].status = 'confirmed';
    bookings[bookingIndex].stripe_status = 'manually_paid';
    bookings[bookingIndex].updated_at = new Date().toISOString();
    saveData(bookings, bookingsFilePath);

    try {
      const additionalServicesList = booking.additional_services && booking.additional_services.length > 0
        ? `<li>Additional Services: ${booking.additional_services.join(', ')}</li>`
        : '';
      const suppliesList = booking.supplies && booking.supplies.length > 0
        ? `<li>Supplies Provided: ${booking.supplies.join(', ')}</li>`
        : '';

      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: booking.customer_email,
        subject: 'Booking Confirmed - CasaClean',
        html: `
          <h2>Your booking is confirmed!</h2>
          <p>Dear ${booking.customer_name},</p>
          <p>Great news! Your cleaning service booking has been confirmed.</p>
          <p><strong>Details:</strong></p>
          <ul>
            <li>Date: ${booking.booking_date}</li>
            <li>Time: ${booking.booking_time}</li>
            <li>Duration: ${booking.hours} hours</li>
            <li>Address: ${booking.street_name} ${booking.house_number}${booking.doorbell_name ? ', ' + booking.doorbell_name : ''}</li>
            <li>Property Size: ${booking.property_size} sqm</li>
            ${additionalServicesList}
            ${suppliesList}
            <li>Total: €${booking.total_amount}</li>
          </ul>
          <p>Your payment has been processed.</p>
          <p>Best regards,<br>CasaClean Team</p>
        `
      });
    } catch (emailError) {
      console.log('Email sending skipped:', emailError.message);
    }

    res.json({ success: true, message: 'Booking manually confirmed and marked as paid' });
  } catch (error) {
    console.error('Error manually confirming booking:', error);
    res.status(500).json({ error: 'Failed to manually confirm booking' });
  }
});

app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Admin ${req.adminId} requested deletion of booking ${id}`);
    const bookingIndex = bookings.findIndex(b => b.id == id);
    if (bookingIndex === -1) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    bookings.splice(bookingIndex, 1);
    saveData(bookings, bookingsFilePath);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

app.delete('/api/admin/bookings', requireAdmin, (req, res) => {
  try {
    console.log(`Admin ${req.adminId} requested clearing all bookings`);
    bookings.length = 0; // Clear the array
    saveData(bookings, bookingsFilePath);
    res.json({ success: true, message: 'All bookings cleared' });
  } catch (error) {
    console.error('Error clearing all bookings:', error);
    res.status(500).json({ error: 'Failed to clear all bookings' });
  }
});

app.get('/api/admin/cities', (req, res) => {
  try {
    res.json(cities);
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

app.put('/api/admin/cities/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, name_it, name_ka, name_ru, enabled, working_days, working_hours_start, working_hours_end } = req.body;

    const cityIndex = cities.findIndex(c => c.id == id);
    if (cityIndex === -1) {
      return res.status(404).json({ error: 'City not found' });
    }

    if (name !== undefined) cities[cityIndex].name = name;
    if (name_it !== undefined) cities[cityIndex].name_it = name_it;
    if (name_ka !== undefined) cities[cityIndex].name_ka = name_ka;
    if (name_ru !== undefined) cities[cityIndex].name_ru = name_ru;
    cities[cityIndex].enabled = enabled;
    cities[cityIndex].working_days = working_days;
    cities[cityIndex].working_hours_start = working_hours_start;
    cities[cityIndex].working_hours_end = working_hours_end;
    saveData(cities, citiesFilePath);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating city:', error);
    res.status(500).json({ error: 'Failed to update city' });
  }
});

app.post('/api/admin/cities', (req, res) => {
  try {
    const { name, name_it, name_ka, name_ru, working_days, working_hours_start, working_hours_end } = req.body;

    const newId = Math.max(...cities.map(c => c.id)) + 1;
    const newCity = {
      id: newId,
      name,
      name_it,
      name_ka,
      name_ru,
      enabled: true,
      working_days: working_days || '1,2,3,4,5',
      working_hours_start: working_hours_start || '08:00',
      working_hours_end: working_hours_end || '18:00'
    };

    cities.push(newCity);
    saveData(cities, citiesFilePath);
    res.json(newCity);
  } catch (error) {
    console.error('Error adding city:', error);
    res.status(500).json({ error: 'Failed to add city' });
  }
});

app.get('/api/admin/services', (req, res) => {
  try {
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

app.put('/api/admin/services/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, name_it, name_ka, name_ru, description, description_it, description_ka, description_ru, price_per_hour, enabled } = req.body;

    const serviceIndex = services.findIndex(s => s.id == id);
    if (serviceIndex === -1) {
      return res.status(404).json({ error: 'Service not found' });
    }

    services[serviceIndex].name = name;
    services[serviceIndex].name_it = name_it;
    if (name_ka !== undefined) services[serviceIndex].name_ka = name_ka;
    if (name_ru !== undefined) services[serviceIndex].name_ru = name_ru;
    services[serviceIndex].description = description;
    services[serviceIndex].description_it = description_it;
    if (description_ka !== undefined) services[serviceIndex].description_ka = description_ka;
    if (description_ru !== undefined) services[serviceIndex].description_ru = description_ru;
    services[serviceIndex].price_per_hour = price_per_hour;
    services[serviceIndex].enabled = enabled;
    saveData(services, servicesFilePath);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

app.post('/api/admin/services', (req, res) => {
  try {
    const { name, name_it, name_ka, name_ru, description, description_it, description_ka, description_ru, price_per_hour, enabled } = req.body;

    const newId = services.length > 0 ? Math.max(...services.map(s => s.id)) + 1 : 1;
    const newService = {
      id: newId,
      name,
      name_it,
      name_ka,
      name_ru,
      description,
      description_it,
      description_ka,
      description_ru,
      price_per_hour: parseFloat(price_per_hour),
      enabled: enabled !== undefined ? enabled : true
    };

    services.push(newService);
    saveData(services, servicesFilePath);
    res.json(newService);
  } catch (error) {
    console.error('Error adding service:', error);
    res.status(500).json({ error: 'Failed to add service' });
  }
});

app.delete('/api/admin/services/:id', (req, res) => {
  try {
    const { id } = req.params;
    const serviceIndex = services.findIndex(s => s.id == id);
    if (serviceIndex === -1) {
      return res.status(404).json({ error: 'Service not found' });
    }

    services.splice(serviceIndex, 1);
    saveData(services, servicesFilePath);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

app.post('/api/admin/blocked-slots', (req, res) => {
  try {
    const { cityId, blockedDate, blockedTime, reason } = req.body;

    const newId = blockedSlots.length > 0 ? Math.max(...blockedSlots.map(s => s.id)) + 1 : 1;
    const newSlot = {
      id: newId,
      city_id: cityId,
      blocked_date: blockedDate,
      blocked_time: blockedTime,
      reason: reason
    };

    blockedSlots.push(newSlot);
    saveData(blockedSlots, blockedSlotsFilePath);
    res.json(newSlot);
  } catch (error) {
    console.error('Error blocking slot:', error);
    res.status(500).json({ error: 'Failed to block slot' });
  }
});

app.delete('/api/admin/blocked-slots/:id', (req, res) => {
  try {
    const { id } = req.params;
    const slotIndex = blockedSlots.findIndex(s => s.id == id);
    if (slotIndex === -1) {
      return res.status(404).json({ error: 'Blocked slot not found' });
    }
    blockedSlots.splice(slotIndex, 1);
    saveData(blockedSlots, blockedSlotsFilePath);
    res.json({ success: true });
  } catch (error) {
    console.error('Error unblocking slot:', error);
    res.status(500).json({ error: 'Failed to unblock slot' });
  }
});

app.get('/api/admin/stats', (req, res) => {
  try {
    const totalBookings = bookings.length;
    const pendingBookings = bookings.filter(b => b.status === 'pending').length;
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed').length;
    const totalRevenue = bookings
      .filter(b => b.status === 'confirmed')
      .reduce((sum, b) => sum + parseFloat(b.total_amount), 0);

    res.json({
      totalBookings,
      pendingBookings,
      confirmedBookings,
      totalRevenue
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/admin/check-session', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  res.json({ authenticated: !!token && adminTokens[token] });
});

// Worker management endpoints
app.get('/api/admin/workers', requireAdmin, (req, res) => {
  try {
    res.json(workers);
  } catch (error) {
    console.error('Error fetching workers:', error);
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

app.post('/api/admin/workers', requireAdmin, (req, res) => {
  try {
    const { name, email, phone, specialties, rating, completed_jobs, active } = req.body;

    const newId = workers.length > 0 ? Math.max(...workers.map(w => w.id)) + 1 : 1;
    const newWorker = {
      id: newId,
      name,
      email,
      phone,
      specialties: specialties || [],
      rating: parseFloat(rating) || 0,
      completed_jobs: parseInt(completed_jobs) || 0,
      active: active !== undefined ? active : true,
      created_at: new Date().toISOString()
    };

    workers.push(newWorker);
    saveData(workers, workersFilePath);
    res.json(newWorker);
  } catch (error) {
    console.error('Error adding worker:', error);
    res.status(500).json({ error: 'Failed to add worker' });
  }
});

app.put('/api/admin/workers/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, specialties, rating, completed_jobs, active } = req.body;

    const workerIndex = workers.findIndex(w => w.id == id);
    if (workerIndex === -1) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    workers[workerIndex] = {
      ...workers[workerIndex],
      name,
      email,
      phone,
      specialties: specialties || [],
      rating: parseFloat(rating) || 0,
      completed_jobs: parseInt(completed_jobs) || 0,
      active: active !== undefined ? active : workers[workerIndex].active
    };

    saveData(workers, workersFilePath);
    res.json(workers[workerIndex]);
  } catch (error) {
    console.error('Error updating worker:', error);
    res.status(500).json({ error: 'Failed to update worker' });
  }
});

app.delete('/api/admin/workers/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const workerIndex = workers.findIndex(w => w.id == id);
    if (workerIndex === -1) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    workers.splice(workerIndex, 1);
    saveData(workers, workersFilePath);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting worker:', error);
    res.status(500).json({ error: 'Failed to delete worker' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Catch-all: serve index.html for non-API routes (SPA support).
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/admin/check-session', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (token && adminTokens[token]) {
    res.json({ authenticated: true });
  } else {
    res.json({ authenticated: false });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log("Server running on port", PORT);
});

