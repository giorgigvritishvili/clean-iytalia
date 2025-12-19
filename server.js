require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Mock data for demo without database
let mockBookings = [];
let mockBlockedSlots = [];
let mockAdmins = [{ id: 1, username: 'admin', password: 'admin123' }]; // Plain password for mock
let mockCities = [
  { id: 1, name: 'Rome', name_it: 'Roma', enabled: true, working_days: '1,2,3,4,5,6', working_hours_start: '09:00', working_hours_end: '17:30' },
  { id: 2, name: 'Milan', name_it: 'Milano', enabled: true, working_days: '1,2,3,4,5,6', working_hours_start: '09:00', working_hours_end: '17:30' }
];
let mockServices = [
  { id: 1, name: 'Regular Cleaning', name_it: 'Pulizia Regolare', description: 'Weekly or bi-weekly cleaning for homes', description_it: 'Pulizia settimanale o bisettimanale per case', price_per_hour: 25.00, enabled: true },
  { id: 2, name: 'One-time Cleaning', name_it: 'Pulizia Una Tantum', description: 'Single deep clean for any occasion', description_it: 'Una pulizia approfondita per qualsiasi occasione', price_per_hour: 30.00, enabled: true },
  { id: 3, name: 'Deep Cleaning', name_it: 'Pulizia Profonda', description: 'Thorough cleaning including hard-to-reach areas', description_it: 'Pulizia accurata incluse le aree difficili da raggiungere', price_per_hour: 35.00, enabled: true },
  { id: 4, name: 'Move-in/Move-out', name_it: 'Trasloco', description: 'Complete cleaning for moving in or out', description_it: 'Pulizia completa per traslochi', price_per_hour: 40.00, enabled: true },
  { id: 5, name: 'Last-minute Cleaning', name_it: 'Pulizia Last Minute', description: 'Urgent cleaning service within 24 hours', description_it: 'Servizio di pulizia urgente entro 24 ore', price_per_hour: 45.00, enabled: true },
  { id: 6, name: 'Business Cleaning', name_it: 'Pulizia Uffici', description: 'Professional cleaning for offices and businesses', description_it: 'Pulizia professionale per uffici e aziende', price_per_hour: 35.00, enabled: true }
];

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
}) : null;

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

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS cities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        name_it VARCHAR(100) NOT NULL,
        enabled BOOLEAN DEFAULT true,
        working_days VARCHAR(50) DEFAULT '1,2,3,4,5',
        working_hours_start TIME DEFAULT '08:00',
        working_hours_end TIME DEFAULT '18:00',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        name_it VARCHAR(100) NOT NULL,
        description TEXT,
        description_it TEXT,
        price_per_hour DECIMAL(10, 2) NOT NULL,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        service_id INTEGER REFERENCES services(id),
        city_id INTEGER REFERENCES cities(id),
        customer_name VARCHAR(200) NOT NULL,
        customer_email VARCHAR(200) NOT NULL,
        customer_phone VARCHAR(50) NOT NULL,
        customer_address TEXT NOT NULL,
        booking_date DATE NOT NULL,
        booking_time TIME NOT NULL,
        hours INTEGER NOT NULL,
        cleaners INTEGER NOT NULL DEFAULT 1,
        total_amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        payment_intent_id VARCHAR(255),
        stripe_status VARCHAR(50) DEFAULT 'authorized',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS blocked_slots (
        id SERIAL PRIMARY KEY,
        city_id INTEGER REFERENCES cities(id),
        blocked_date DATE NOT NULL,
        blocked_time TIME,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const citiesResult = await client.query('SELECT COUNT(*) FROM cities');
    if (parseInt(citiesResult.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO cities (name, name_it, enabled, working_days, working_hours_start, working_hours_end) VALUES
        ('Rome', 'Roma', true, '1,2,3,4,5,6', '08:00', '18:00'),
        ('Milan', 'Milano', true, '1,2,3,4,5,6', '08:00', '18:00')
      `);
    }

    const servicesResult = await client.query('SELECT COUNT(*) FROM services');
    if (parseInt(servicesResult.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO services (name, name_it, description, description_it, price_per_hour, enabled) VALUES
        ('Regular Cleaning', 'Pulizia Regolare', 'Weekly or bi-weekly cleaning for homes', 'Pulizia settimanale o bisettimanale per case', 25.00, true),
        ('One-time Cleaning', 'Pulizia Una Tantum', 'Single deep clean for any occasion', 'Una pulizia approfondita per qualsiasi occasione', 30.00, true),
        ('Deep Cleaning', 'Pulizia Profonda', 'Thorough cleaning including hard-to-reach areas', 'Pulizia accurata incluse le aree difficili da raggiungere', 35.00, true),
        ('Move-in/Move-out', 'Trasloco', 'Complete cleaning for moving in or out', 'Pulizia completa per traslochi', 40.00, true),
        ('Last-minute Cleaning', 'Pulizia Last Minute', 'Urgent cleaning service within 24 hours', 'Servizio di pulizia urgente entro 24 ore', 45.00, true),
        ('Business Cleaning', 'Pulizia Uffici', 'Professional cleaning for offices and businesses', 'Pulizia professionale per uffici e aziende', 35.00, true)
      `);
    }

    const adminsResult = await client.query('SELECT COUNT(*) FROM admins');
    if (parseInt(adminsResult.rows[0].count) === 0) {
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await client.query(
        'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
        [adminUsername, hashedPassword]
      );
      console.log('Default admin created. Please change password via environment variables.');
    }

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

app.get('/api/cities', async (req, res) => {
  try {
    if (pool) {
      const result = await pool.query('SELECT * FROM cities WHERE enabled = true ORDER BY name');
      res.json(result.rows);
    } else {
      res.json(mockCities.filter(c => c.enabled));
    }
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

app.get('/api/services', async (req, res) => {
  try {
    if (pool) {
      const result = await pool.query('SELECT * FROM services WHERE enabled = true ORDER BY name');
      res.json(result.rows);
    } else {
      res.json(mockServices.filter(s => s.enabled));
    }
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

app.get('/api/available-slots', async (req, res) => {
  try {
    const { cityId, date } = req.query;
    
    const cityResult = await pool.query('SELECT * FROM cities WHERE id = $1', [cityId]);
    if (cityResult.rows.length === 0) {
      return res.status(404).json({ error: 'City not found' });
    }
    
    const city = cityResult.rows[0];
    const requestDate = new Date(date);
    const dayOfWeek = requestDate.getDay() || 7;
    
    if (!city.working_days.split(',').includes(dayOfWeek.toString())) {
      return res.json({ slots: [], message: 'Not a working day' });
    }
    
    const blockedResult = await pool.query(
      'SELECT blocked_time FROM blocked_slots WHERE city_id = $1 AND blocked_date = $2',
      [cityId, date]
    );
    const blockedTimes = blockedResult.rows.map(r => r.blocked_time);
    
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

app.get('/api/bookings', async (req, res) => {
  try {
    if (pool) {
      const result = await pool.query('SELECT * FROM bookings ORDER BY created_at DESC');
      res.json(result.rows);
    } else {
      res.json(mockBookings);
    }
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    if (pool) {
      const {
        serviceId, cityId, customerName, customerEmail, customerPhone,
        customerAddress, bookingDate, bookingTime, hours, cleaners,
        totalAmount, paymentIntentId, notes
      } = req.body;
      
      const result = await pool.query(
        `INSERT INTO bookings (
          service_id, city_id, customer_name, customer_email, customer_phone,
          customer_address, booking_date, booking_time, hours, cleaners,
          total_amount, payment_intent_id, notes, status, stripe_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', 'authorized')
        RETURNING *`,
        [serviceId, cityId, customerName, customerEmail, customerPhone,
         customerAddress, bookingDate, bookingTime, hours, cleaners,
         totalAmount, paymentIntentId, notes]
      );
      
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
      
      res.json(result.rows[0]);
    } else {
      // Mock mode
      const booking = {
        id: mockBookings.length + 1,
        ...req.body,
        status: 'pending',
        created_at: new Date().toISOString()
      };
      mockBookings.push(booking);
      res.json(booking);
    }
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Admin routes
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    console.log('Login attempt:', { username: trimmedUsername, password: trimmedPassword ? '***' : 'empty' });
    
    if (pool) {
      const result = await pool.query('SELECT * FROM admins WHERE username = $1', [trimmedUsername]);
      
      if (result.rows.length === 0) {
        console.log('Admin not found in DB');
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const admin = result.rows[0];
      const validPassword = await bcrypt.compare(trimmedPassword, admin.password_hash);
      
      if (!validPassword) {
        console.log('Password invalid for admin:', admin.username);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      req.session.adminId = admin.id;
      res.json({ success: true, message: 'Login successful' });
    } else {
      // Mock mode
      console.log('Mock mode login');
      const admin = mockAdmins.find(a => a.username === trimmedUsername);
      if (!admin || admin.password !== trimmedPassword) {
        console.log('Mock login failed:', { found: !!admin, passwordMatch: admin ? admin.password === trimmedPassword : false });
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      req.session.adminId = admin.id;
      res.json({ success: true, message: 'Login successful' });
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/admin/check-session', (req, res) => {
  if (req.session.adminId) {
    res.json({ authenticated: true });
  } else {
    res.json({ authenticated: false });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

function requireAdmin(req, res, next) {
  if (!req.session.adminId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/api/admin/bookings', requireAdmin, async (req, res) => {
  try {
    if (pool) {
      const result = await pool.query(`
        SELECT b.*, s.name as service_name, s.name_it as service_name_it,
               c.name as city_name, c.name_it as city_name_it
        FROM bookings b
        LEFT JOIN services s ON b.service_id = s.id
        LEFT JOIN cities c ON b.city_id = c.id
        ORDER BY b.created_at DESC
      `);
      res.json(result.rows);
    } else {
      res.json(mockBookings);
    }
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

app.post('/api/admin/bookings/:id/confirm', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (pool) {
      const bookingResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
      if (bookingResult.rows.length === 0) {
        return res.status(404).json({ error: 'Booking not found' });
      }
      
      const booking = bookingResult.rows[0];
      
      if (stripe && booking.payment_intent_id) {
        try {
          await stripe.paymentIntents.capture(booking.payment_intent_id);
        } catch (stripeError) {
          console.error('Stripe capture error:', stripeError);
        }
      }
      
      await pool.query(
        `UPDATE bookings SET status = 'confirmed', stripe_status = 'captured', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );
      
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
    } else {
      const booking = mockBookings.find(b => b.id == id);
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }
      booking.status = 'confirmed';
      booking.stripe_status = 'captured';
    }
    
    res.json({ success: true, message: 'Booking confirmed successfully' });
  } catch (error) {
    console.error('Error confirming booking:', error);
    res.status(500).json({ error: 'Failed to confirm booking' });
  }
});

app.post('/api/admin/bookings/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (pool) {
      const bookingResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
      if (bookingResult.rows.length === 0) {
        return res.status(404).json({ error: 'Booking not found' });
      }
      
      const booking = bookingResult.rows[0];
      
      if (stripe && booking.payment_intent_id) {
        try {
          await stripe.paymentIntents.cancel(booking.payment_intent_id);
        } catch (stripeError) {
          console.error('Stripe cancel error:', stripeError);
        }
      }
      
      await pool.query(
        `UPDATE bookings SET status = 'cancelled', stripe_status = 'released', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );
      
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
    } else {
      const booking = mockBookings.find(b => b.id == id);
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }
      booking.status = 'cancelled';
      booking.stripe_status = 'released';
    }
    
    res.json({ success: true, message: 'Booking rejected' });
  } catch (error) {
    console.error('Error rejecting booking:', error);
    res.status(500).json({ error: 'Failed to reject booking' });
  }
});

app.get('/api/admin/cities', requireAdmin, async (req, res) => {
  try {
    if (pool) {
      const result = await pool.query('SELECT * FROM cities ORDER BY name');
      res.json(result.rows);
    } else {
      res.json(mockCities);
    }
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

app.post('/api/admin/cities', requireAdmin, async (req, res) => {
  try {
    const { name, name_it, working_days, working_hours_start, working_hours_end } = req.body;
    
    if (pool) {
      const result = await pool.query(
        `INSERT INTO cities (name, name_it, working_days, working_hours_start, working_hours_end) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, name_it, working_days || '1,2,3,4,5', working_hours_start || '08:00', working_hours_end || '18:00']
      );
      
      res.json(result.rows[0]);
    } else {
      const newCity = {
        id: mockCities.length + 1,
        name,
        name_it,
        enabled: true,
        working_days: working_days || '1,2,3,4,5',
        working_hours_start: working_hours_start || '08:00',
        working_hours_end: working_hours_end || '18:00'
      };
      mockCities.push(newCity);
      res.json(newCity);
    }
  } catch (error) {
    console.error('Error adding city:', error);
    res.status(500).json({ error: 'Failed to add city' });
  }
});

app.put('/api/admin/cities/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, name_it, enabled, working_days, working_hours_start, working_hours_end } = req.body;
    
    if (pool) {
      await pool.query(
        `UPDATE cities SET name = $1, name_it = $2, enabled = $3, working_days = $4, working_hours_start = $5, working_hours_end = $6 WHERE id = $7`,
        [name, name_it, enabled, working_days, working_hours_start, working_hours_end, id]
      );
    } else {
      const city = mockCities.find(c => c.id == id);
      if (city) {
        city.name = name;
        city.name_it = name_it;
        city.enabled = enabled;
        city.working_days = working_days;
        city.working_hours_start = working_hours_start;
        city.working_hours_end = working_hours_end;
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating city:', error);
    res.status(500).json({ error: 'Failed to update city' });
  }
});

app.delete('/api/admin/cities/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (pool) {
      await pool.query('DELETE FROM cities WHERE id = $1', [id]);
    } else {
      const index = mockCities.findIndex(c => c.id == id);
      if (index > -1) {
        mockCities.splice(index, 1);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting city:', error);
    res.status(500).json({ error: 'Failed to delete city' });
  }
});

app.get('/api/admin/services', requireAdmin, async (req, res) => {
  try {
    if (pool) {
      const result = await pool.query('SELECT * FROM services ORDER BY name');
      res.json(result.rows);
    } else {
      res.json(mockServices);
    }
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

app.post('/api/admin/services', requireAdmin, async (req, res) => {
  try {
    const { name, name_it, description, description_it, price_per_hour } = req.body;
    
    if (pool) {
      const result = await pool.query(
        `INSERT INTO services (name, name_it, description, description_it, price_per_hour) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, name_it, description, description_it, price_per_hour]
      );
      
      res.json(result.rows[0]);
    } else {
      const newService = {
        id: mockServices.length + 1,
        name,
        name_it,
        description,
        description_it,
        price_per_hour: parseFloat(price_per_hour),
        enabled: true
      };
      mockServices.push(newService);
      res.json(newService);
    }
  } catch (error) {
    console.error('Error adding service:', error);
    res.status(500).json({ error: 'Failed to add service' });
  }
});

app.put('/api/admin/services/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, name_it, description, description_it, price_per_hour, enabled } = req.body;
    
    if (pool) {
      await pool.query(
        `UPDATE services SET name = $1, name_it = $2, description = $3, description_it = $4, price_per_hour = $5, enabled = $6 WHERE id = $7`,
        [name, name_it, description, description_it, price_per_hour, enabled, id]
      );
    } else {
      const service = mockServices.find(s => s.id == id);
      if (service) {
        service.name = name;
        service.name_it = name_it;
        service.description = description;
        service.description_it = description_it;
        service.price_per_hour = parseFloat(price_per_hour);
        service.enabled = enabled;
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

app.delete('/api/admin/services/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (pool) {
      await pool.query('DELETE FROM services WHERE id = $1', [id]);
    } else {
      const index = mockServices.findIndex(s => s.id == id);
      if (index > -1) {
        mockServices.splice(index, 1);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    if (pool) {
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
    } else {
      const totalBookings = mockBookings.length;
      const pendingBookings = mockBookings.filter(b => b.status === 'pending').length;
      const confirmedBookings = mockBookings.filter(b => b.status === 'confirmed').length;
      const totalRevenue = mockBookings
        .filter(b => b.status === 'confirmed')
        .reduce((sum, b) => sum + parseFloat(b.total_amount), 0);
      
      res.json({
        totalBookings,
        pendingBookings,
        confirmedBookings,
        totalRevenue
      });
    }
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

if (pool) {
  initDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
} else {
  console.log('Running without database - using mock data');
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
