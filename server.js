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

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// In-memory data
let services = [
  { id: 1, name: 'Regular Cleaning', name_it: 'Pulizia Regolare', description: 'Weekly or bi-weekly cleaning for homes', description_it: 'Pulizia settimanale o bisettimanale per case', price_per_hour: 18.90, enabled: true },
  { id: 2, name: 'One-time Cleaning', name_it: 'Pulizia Una Tantum', description: 'Single deep clean for any occasion', description_it: 'Una pulizia approfondita per qualsiasi occasione', price_per_hour: 21.90, enabled: true },
  { id: 3, name: 'Deep Cleaning', name_it: 'Pulizia Profonda', description: 'Thorough cleaning including hard-to-reach areas', description_it: 'Pulizia accurata incluse le aree difficili da raggiungere', price_per_hour: 25.90, enabled: true },
  { id: 4, name: 'Move-in/Move-out', name_it: 'Trasloco', description: 'Complete cleaning for moving in or out', description_it: 'Pulizia completa per traslochi', price_per_hour: 25.90, enabled: true },
  { id: 5, name: 'Last-minute Cleaning', name_it: 'Pulizia Last Minute', description: 'Urgent cleaning service within 24 hours', description_it: 'Servizio di pulizia urgente entro 24 ore', price_per_hour: 31.90, enabled: true },
  { id: 6, name: 'Business Cleaning', name_it: 'Pulizia Uffici', description: 'Professional cleaning for offices and businesses', description_it: 'Pulizia professionale per uffici e aziende', price_per_hour: 35.00, enabled: true }
];

let cities = [
  { id: 1, name: 'Rome', name_it: 'Roma', enabled: true, working_days: '1,2,3,4,5,6,7', working_hours_start: '09:00', working_hours_end: '17:30' },
  { id: 2, name: 'Milan', name_it: 'Milano', enabled: true, working_days: '1,2,3,4,5,6,7', working_hours_start: '09:00', working_hours_end: '17:30' }
];

let bookings = [];
let admins = [{ id: 1, username: 'CasaClean', password_hash: '$2a$10$hashedpassword' }];
let blockedSlots = [];

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

// Initialize admin password hash
(async () => {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
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

    bookings.push(newBooking);

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

function requireAdmin(req, res, next) {
  if (!req.session.adminId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  try {
    const bookingsWithDetails = bookings.map(booking => {
      const service = services.find(s => s.id === booking.service_id);
      const city = cities.find(c => c.id === booking.city_id);
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
    bookings[bookingIndex].updated_at = new Date().toISOString();

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
    bookings[bookingIndex].updated_at = new Date().toISOString();

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

app.get('/api/admin/cities', requireAdmin, (req, res) => {
  try {
    res.json(cities);
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

app.post('/api/admin/cities', requireAdmin, (req, res) => {
  try {
    const { name, name_it, working_days, working_hours_start, working_hours_end } = req.body;

    const newId = Math.max(...cities.map(c => c.id)) + 1;
    const newCity = {
      id: newId,
      name,
      name_it,
      enabled: true,
      working_days: working_days || '1,2,3,4,5',
      working_hours_start: working_hours_start || '08:00',
      working_hours_end: working_hours_end || '18:00'
    };

    cities.push(newCity);
    res.json(newCity);
  } catch (error) {
    console.error('Error adding city:', error);
    res.status(500).json({ error: 'Failed to add city' });
  }
});

app.get('/api/admin/services', requireAdmin, (req, res) => {
  try {
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

app.put('/api/admin/services/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { name, name_it, description, description_it, price_per_hour, enabled } = req.body;

    const serviceIndex = services.findIndex(s => s.id == id);
    if (serviceIndex === -1) {
      return res.status(404).json({ error: 'Service not found' });
    }

    services[serviceIndex].name = name;
    services[serviceIndex].name_it = name_it;
    services[serviceIndex].description = description;
    services[serviceIndex].description_it = description_it;
    services[serviceIndex].price_per_hour = price_per_hour;
    services[serviceIndex].enabled = enabled;

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

app.post('/api/admin/services', requireAdmin, (req, res) => {
  try {
    const { name, name_it, description, description_it, price_per_hour, enabled } = req.body;

    const newId = services.length > 0 ? Math.max(...services.map(s => s.id)) + 1 : 1;
    const newService = {
      id: newId,
      name,
      name_it,
      description,
      description_it,
      price_per_hour: parseFloat(price_per_hour),
      enabled: enabled !== undefined ? enabled : true
    };

    services.push(newService);
    res.json(newService);
  } catch (error) {
    console.error('Error adding service:', error);
    res.status(500).json({ error: 'Failed to add service' });
  }
});

app.delete('/api/admin/services/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const serviceIndex = services.findIndex(s => s.id == id);
    if (serviceIndex === -1) {
      return res.status(404).json({ error: 'Service not found' });
    }

    services.splice(serviceIndex, 1);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

app.post('/api/admin/blocked-slots', requireAdmin, (req, res) => {
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
    res.json(newSlot);
  } catch (error) {
    console.error('Error blocking slot:', error);
    res.status(500).json({ error: 'Failed to block slot' });
  }
});

app.delete('/api/admin/blocked-slots/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const slotIndex = blockedSlots.findIndex(s => s.id == id);
    if (slotIndex === -1) {
      return res.status(404).json({ error: 'Blocked slot not found' });
    }
    blockedSlots.splice(slotIndex, 1);
    res.json({ success: true });
  } catch (error) {
    console.error('Error unblocking slot:', error);
    res.status(500).json({ error: 'Failed to unblock slot' });
  }
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
