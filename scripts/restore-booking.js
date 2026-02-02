const fs = require('fs');
const path = require('path');

const bookingsPath = path.join(__dirname, '..', 'data', 'bookings.json');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadBookings() {
  try {
    if (!fs.existsSync(bookingsPath)) return [];
    return JSON.parse(fs.readFileSync(bookingsPath, 'utf8')) || [];
  } catch (err) {
    console.error('Failed to load bookings:', err);
    return [];
  }
}

function saveBookings(arr) {
  try {
    ensureDir(bookingsPath);
    fs.writeFileSync(bookingsPath, JSON.stringify(arr, null, 2));
    console.log(`Saved ${arr.length} bookings to ${bookingsPath}`);
    return true;
  } catch (err) {
    console.error('Failed to save bookings:', err);
    return false;
  }
}

function makeBookingFromArg(arg) {
  // If arg is a path to a json file, read it; else try parse JSON string
  if (!arg) return null;
  try {
    if (fs.existsSync(arg)) {
      return JSON.parse(fs.readFileSync(arg, 'utf8'));
    }
  } catch (e) {
    // ignore and try parse
  }
  try {
    return JSON.parse(arg);
  } catch (e) {
    return null;
  }
}

(function main() {
  const arg = process.argv[2];
  const input = makeBookingFromArg(arg);

  const bookings = loadBookings();
  const newId = bookings.length > 0 ? Math.max(...bookings.map(b => b.id || 0)) + 1 : 1;

  const defaultBooking = {
    id: newId,
    service_id: 1,
    city_id: 1,
    customer_name: 'Restored Booking',
    customer_email: 'restore@example.com',
    customer_phone: '000',
    street_name: 'Unknown',
    house_number: '0',
    property_size: '50',
    doorbell_name: '',
    booking_date: new Date().toISOString().slice(0,10),
    booking_time: '10:00',
    hours: 2,
    cleaners: 1,
    total_amount: 40,
    payment_intent_id: null,
    notes: 'Restored via scripts/restore-booking.js',
    additional_services: [],
    supplies: [],
    status: 'pending',
    stripe_status: 'authorized',
    created_at: new Date().toISOString()
  };

  const newBooking = Object.assign({}, defaultBooking, input || {});
  bookings.push(newBooking);

  if (!saveBookings(bookings)) {
    console.error('Could not save booking.');
    process.exit(1);
  }

  console.log('Booking added:', newBooking);
})();
