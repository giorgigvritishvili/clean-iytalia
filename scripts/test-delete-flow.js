const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5000;
const BASE = `http://localhost:${PORT}`;
const bookingsPath = path.join(__dirname, '..', 'data', 'bookings.json');

async function postBooking() {
  const unique = Date.now();
  const booking = {
    serviceId: 1,
    cityId: 1,
    customerName: `DeleteFlow ${unique}`,
    customerEmail: `deleteflow${unique}@example.local`,
    customerPhone: '000',
    streetName: 'Flow St',
    houseNumber: '2',
    propertySize: '60',
    doorbellName: '',
    bookingDate: new Date().toISOString().slice(0,10),
    bookingTime: '14:00',
    hours: 2,
    cleaners: 1,
    totalAmount: 50,
    paymentIntentId: `deleteflow-${unique}`,
    notes: 'test-delete-flow',
    additionalServices: [],
    supplies: []
  };

  const res = await fetch(`${BASE}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(booking)
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, booking };
}

async function adminLogin(username, password) {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function deleteBooking(id, token) {
  const res = await fetch(`${BASE}/api/admin/bookings/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

(async () => {
  try {
    console.log('Posting booking...');
    const posted = await postBooking();
    console.log('Post status:', posted.status, 'response:', posted.body);
    if (!posted.body || !posted.body.id) {
      console.error('Booking post did not return id; aborting');
      process.exit(2);
    }

    const bookingId = posted.body.id;

    console.log('Logging in as admin...');
    const username = process.env.ADMIN_USER || 'CasaClean';
    const password = process.env.ADMIN_PASSWORD || 'CasaClean2026';
    const login = await adminLogin(username, password);
    console.log('Login status:', login.status, 'body:', login.body);
    if (!login.body || !login.body.token) {
      console.error('Failed to login as admin; aborting.');
      process.exit(3);
    }

    const token = login.body.token;
    console.log('Deleting booking id', bookingId);
    const del = await deleteBooking(bookingId, token);
    console.log('Delete status:', del.status, 'body:', del.body);

    // wait briefly for file system flush
    await new Promise(r => setTimeout(r, 200));

    if (!fs.existsSync(bookingsPath)) {
      console.error('Bookings file missing at', bookingsPath);
      process.exit(4);
    }

    const raw = fs.readFileSync(bookingsPath, 'utf8');
    const arr = JSON.parse(raw || '[]');

    const found = arr.find(b => Number(b.id) === Number(bookingId) || b.payment_intent_id === posted.booking.paymentIntentId);

    if (found) {
      console.error('Booking still present after delete:', found.id);
      process.exit(5);
    } else {
      console.log('SUCCESS: Booking removed from data/bookings.json');
      process.exit(0);
    }

  } catch (err) {
    console.error('Test error:', err);
    process.exit(9);
  }
})();
