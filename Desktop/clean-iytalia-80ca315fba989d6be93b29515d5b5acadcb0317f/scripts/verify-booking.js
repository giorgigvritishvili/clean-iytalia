const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const bookingsPath = path.join(__dirname, '..', 'data', 'bookings.json');

(async () => {
  try {
    const unique = Date.now();
    const booking = {
      serviceId: 1,
      cityId: 1,
      customerName: `Verify Script ${unique}`,
      customerEmail: `verify${unique}@example.local`,
      customerPhone: '000',
      streetName: 'Script St',
      houseNumber: '1',
      propertySize: '60',
      doorbellName: '',
      bookingDate: new Date().toISOString().slice(0,10),
      bookingTime: '11:00',
      hours: 2,
      cleaners: 1,
      totalAmount: 50,
      paymentIntentId: `verify-${unique}`,
      notes: 'verify-booking script',
      additionalServices: [],
      supplies: []
    };

    console.log('Posting booking to server...');
    const res = await fetch(`http://localhost:${PORT}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(booking)
    });

    const body = await res.json().catch(() => ({}));
    console.log('Server response status:', res.status);
    console.log('Server response body:', body);

    // Give server a moment to flush file (saveData is synchronous but be conservative)
    await new Promise(r => setTimeout(r, 250));

    if (!fs.existsSync(bookingsPath)) {
      console.error('Bookings file not found at', bookingsPath);
      process.exit(2);
    }

    const fileRaw = fs.readFileSync(bookingsPath, 'utf8');
    const arr = JSON.parse(fileRaw || '[]');

    const found = arr.find(b => Number(b.id) === Number(body.id) || b.payment_intent_id === booking.paymentIntentId || b.customer_email === booking.customerEmail);

    if (found) {
      console.log('SUCCESS: Booking persisted in data/bookings.json:', found.id);
      process.exit(0);
    } else {
      console.error('FAIL: Booking not found in data/bookings.json');
      process.exit(1);
    }

  } catch (err) {
    console.error('Error during verification:', err);
    process.exit(3);
  }
})();
