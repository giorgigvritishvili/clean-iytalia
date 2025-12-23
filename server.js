require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = 5000;

// In-memory storage for localhost
let cities = [];
let services = [];
let bookings = [];
let admins = [];
let blockedSlots = [];
let nextId = { cities: 1, services: 1, bookings: 1, admins: 1, blockedSlots: 1 };

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'cleaning-service-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.get('/api/config', (req, res) => {
  res.json({
    stripePublicKey: process.env.STRIPE_PUBLISHABLE_KEY || null
  });
});

async function initDB() {
  if (cities.length === 0) {
    cities = [
      { id: nextId.cities++, name: 'Rome', name_it: 'Roma', enabled: true, working_days: '1,2,3,4,5,6', working_hours_start: '08:00', working_hours_end: '18:00', created_at: new Date() },
      { id: nextId.cities++, name: 'Milan', name_it: 'Milano', enabled: true, working_days: '1,2,3,4,5,6', working_hours_start: '08:00', working_hours_end: '18:00', created_at: new Date() }
    ];
  }

  if (services.length === 0) {
    services = [
      { id: nextId.services++, name: 'Regular Cleaning', name_it: 'Pulizia Regolare', description: 'Weekly or bi-weekly cleaning for homes', description_it: 'Pulizia settimanale o bisettimanale per case', price_per_hour: 25.00, enabled: true, created_at: new Date() },
      { id: nextId.services++, name: 'One-time Cleaning', name_it: 'Pulizia Una Tantum', description: 'Single deep clean for any occasion', description_it: 'Una pulizia approfondita per qualsiasi occasione', price_per_hour: 30.00, enabled: true, created_at: new Date() },
      { id: nextId.services++, name: 'Deep Cleaning', name_it: 'Pulizia Profonda', description: 'Thorough cleaning including hard-to-reach areas', description_it: 'Pulizia accurata incluse le aree difficili da raggiungere', price_per_hour: 35.00, enabled: true, created_at: new Date() },
      { id: nextId.services++, name: 'Move-in/Move-out', name_it: 'Trasloco', description: 'Complete cleaning for moving in or out', description_it: 'Pulizia completa per traslochi', price_per_hour: 40.00, enabled: true, created_at: new Date() },
      { id: nextId.services++, name: 'Last-minute Cleaning', name_it: 'Pulizia Last Minute', description: 'Urgent cleaning service within 24 hours', description_it: 'Servizio di pulizia urgente entro 24 ore', price_per_hour: 45.00, enabled: true, created_at: new Date() },
      { id: nextId.services++, name: 'Business Cleaning', name_it: 'Pulizia Uffici', description: 'Professional cleaning for offices and businesses', description_it: 'Pulizia professionale per uffici e aziende', price_per_hour: 35.00, enabled: true, created_at: new Date() }
    ];
  }

  if (admins.length === 0) {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    admins.push({ id: nextId.admins++, username: adminUsername, password_hash: hashedPassword, created_at: new Date() });
    console.log('Default admin created. Please change password via environment variables.');
  }

  console.log('Database initialized successfully');
}

app.get('/api/cities', (req, res) => {
  try {
    const enabledCities = cities.filter(c => c.enabled).sort((a, b) => a.name.localeCompare(b.name));
    res.json(enabledCities);
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

app.get('/api/services', (req, res) => {
  try {
    const enabledServices = services.filter(s => s.enabled).sort((a, b) => a.name.localeCompare(b.name));
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
      .filter(bs => bs.city_id == cityId && bs.blocked_date === date)
      .map(bs => bs.blocked_time);

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
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured' });
    }
    
    const { amount, currency = 'eur' } = req.body;
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      capture_method: 'manual',
    });
    
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const {
      serviceId, cityId, customerName, customerEmail, customerPhone,
      customerAddress, bookingDate, bookingTime, hours, cleaners,
      totalAmount, paymentIntentId, notes
    } = req.body;

    const newBooking = {
      id: nextId.bookings++,
      service_id: serviceId,
      city_id: cityId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      booking_date: bookingDate,
      booking_time: bookingTime,
      hours: hours,
      cleaners: cleaners || 1,
      total_amount: totalAmount,
      payment_intent_id: paymentIntentId,
      notes: notes,
      status: 'pending',
      stripe_status: 'authorized',
      created_at: new Date(),
      updated_at: new Date()
    };

    bookings.push(newBooking);

    try {
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: customerEmail,
        subject: 'Booking Pending Confirmation - Clean Italia',
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
          <p>Best regards,<br>Clean Italia Team</p>
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

    req.session.adminId = admin.id;
    res.json({ success: true, message: 'Login successful' });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.post('/api/admin/admins', requireAdmin, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const existingAdmin = admins.find(a => a.username === username);
    if (existingAdmin) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = {
      id: nextId.admins++,
      username: username,
      password_hash: hashedPassword,
      created_at: new Date()
    };

    admins.push(newAdmin);

    res.status(201).json({ id: newAdmin.id, username: newAdmin.username, created_at: newAdmin.created_at });
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

function requireAdmin(req, res, next) {
  if (!req.session.adminId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  try {
    const bookingsWithDetails = bookings.map(booking => {
      const service = services.find(s => s.id == booking.service_id);
      const city = cities.find(c => c.id == booking.city_id);

      return {
        ...booking,
        service_name: service ? service.name : null,
        service_name_it: service ? service.name_it : null,
        city_name: city ? city.name : null,
        city_name_it: city ? city.name_it : null
      };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(bookingsWithDetails);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

app.post('/api/admin/bookings/:id/confirm', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const bookingIndex = bookings.findIndex(b => b.id == id);
    if (bookingIndex === -1) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookings[bookingIndex];

    if (stripe && booking.payment_intent_id) {
      try {
        await stripe.paymentIntents.capture(booking.payment_intent_id);
      } catch (stripeError) {
        console.error('Stripe capture error:', stripeError);
      }
    }

    bookings[bookingIndex].status = 'confirmed';
    bookings[bookingIndex].stripe_status = 'captured';
    bookings[bookingIndex].updated_at = new Date();

    try {
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: booking.customer_email,
        subject: 'Booking Confirmed - Clean Italia',
        html: `
          <h2>Your booking is confirmed!</h2>
          <p>Dear ${booking.customer_name},</p>
          <p>Great news! Your cleaning service booking has been confirmed.</p>
          <p><strong>Details:</strong></p>
          <ul>
            <li>Date: ${booking.booking_date}</li>
            <li>Time: ${booking.booking_time}</li>
            <li>Duration: ${booking.hours} hours</li>
            <li>Address: ${booking.customer_address}</li>
            <li>Total: €${booking.total_amount}</li>
          </ul>
          <p>Your payment has been processed.</p>
          <p>Best regards,<br>Clean Italia Team</p>
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

app.post('/api/admin/bookings/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const bookingIndex = bookings.findIndex(b => b.id == id);
    if (bookingIndex === -1) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookings[bookingIndex];

    if (stripe && booking.payment_intent_id) {
      try {
        await stripe.paymentIntents.cancel(booking.payment_intent_id);
      } catch (stripeError) {
        console.error('Stripe cancel error:', stripeError);
      }
    }

    bookings[bookingIndex].status = 'cancelled';
    bookings[bookingIndex].stripe_status = 'released';
    bookings[bookingIndex].updated_at = new Date();

    try {
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: booking.customer_email,
        subject: 'Booking Not Confirmed - Clean Italia',
        html: `
          <h2>Booking Update</h2>
          <p>Dear ${booking.customer_name},</p>
          <p>Unfortunately, we were unable to confirm your booking for ${booking.booking_date}.</p>
          <p>The authorized payment has been released and will be returned to your card.</p>
          <p>Please feel free to book another time that works for you.</p>
          <p>Best regards,<br>Clean Italia Team</p>
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

app.get('/api/admin/cities', requireAdmin, (req, res) => {
  try {
    const sortedCities = cities.sort((a, b) => a.name.localeCompare(b.name));
    res.json(sortedCities);
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

app.put('/api/admin/cities/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, working_days, working_hours_start, working_hours_end } = req.body;

    const cityIndex = cities.findIndex(c => c.id == id);
    if (cityIndex === -1) {
      return res.status(404).json({ error: 'City not found' });
    }

    cities[cityIndex].enabled = enabled;
    cities[cityIndex].working_days = working_days;
    cities[cityIndex].working_hours_start = working_hours_start;
    cities[cityIndex].working_hours_end = working_hours_end;

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating city:', error);
    res.status(500).json({ error: 'Failed to update city' });
  }
});

app.post('/api/admin/cities', requireAdmin, async (req, res) => {
  try {
    const { name, name_it, working_days, working_hours_start, working_hours_end } = req.body;
    
    const result = await pool.query(
      `INSERT INTO cities (name, name_it, working_days, working_hours_start, working_hours_end) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, name_it, working_days || '1,2,3,4,5', working_hours_start || '08:00', working_hours_end || '18:00']
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding city:', error);
    res.status(500).json({ error: 'Failed to add city' });
  }
});

app.get('/api/admin/services', requireAdmin, (req, res) => {
  try {
    const sortedServices = services.sort((a, b) => a.name.localeCompare(b.name));
    res.json(sortedServices);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

app.put('/api/admin/services/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, price_per_hour } = req.body;

    const serviceIndex = services.findIndex(s => s.id == id);
    if (serviceIndex === -1) {
      return res.status(404).json({ error: 'Service not found' });
    }

    services[serviceIndex].enabled = enabled;
    services[serviceIndex].price_per_hour = price_per_hour;

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

app.post('/api/admin/blocked-slots', requireAdmin, async (req, res) => {
  try {
    const { cityId, blockedDate, blockedTime, reason } = req.body;
    
    const result = await pool.query(
      `INSERT INTO blocked_slots (city_id, blocked_date, blocked_time, reason) VALUES ($1, $2, $3, $4) RETURNING *`,
      [cityId, blockedDate, blockedTime, reason]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error blocking slot:', error);
    res.status(500).json({ error: 'Failed to block slot' });
  }
});

app.delete('/api/admin/blocked-slots/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM blocked_slots WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error unblocking slot:', error);
    res.status(500).json({ error: 'Failed to unblock slot' });
  }
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const totalBookings = await pool.query('SELECT COUNT(*) FROM bookings');
    const pendingBookings = await pool.query("SELECT COUNT(*) FROM bookings WHERE status = 'pending'");
    const confirmedBookings = await pool.query("SELECT COUNT(*) FROM bookings WHERE status = 'confirmed'");
    const totalRevenue = await pool.query("SELECT COALESCE(SUM(total_amount), 0) as total FROM bookings WHERE status = 'confirmed'");
    
    res.json({
      totalBookings: parseInt(totalBookings.rows[0].count),
      pendingBookings: parseInt(pendingBookings.rows[0].count),
      confirmedBookings: parseInt(confirmedBookings.rows[0].count),
      totalRevenue: parseFloat(totalRevenue.rows[0].total)
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/admin/check-session', (req, res) => {
  if (req.session.adminId) {
    res.json({ authenticated: true });
  } else {
    res.json({ authenticated: false });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
