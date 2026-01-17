let services = [];
let cities = [];
let selectedService = null;
let stripe = null;
let cardElement = null;
let cardComplete = false;
let currentLanguage = 'en';

// =======================
// EMBEDDED DATA
// =======================

const embeddedServices = [
  {
    "id": 1,
    "name": "Regular Cleaning",
    "name_it": "Pulizia Regolare",
    "name_ru": "Регулярная уборка",
    "name_ka": "რეგულარული დასუფავება",
    "description": "Weekly or bi-weekly cleaning for homes",
    "description_it": "Pulizia settimanale o bisettimanale per case",
    "description_ru": "Еженедельная или двухнедельная уборка для домов",
    "description_ka": "კვირაში ან ორჯერ კვირაში დასუფავება სახლებისთვის",
    "price_per_hour": 18.9,
    "enabled": true
  },
  {
    "id": 2,
    "name": "One-time Cleaning",
    "name_it": "Pulizia Una Tantum",
    "name_ru": "Разовая уборка",
    "name_ka": "ერთჯერადი დასუფავება",
    "description": "Single deep clean for any occasion",
    "description_it": "Una pulizia approfondita per qualsiasi occasione",
    "description_ru": "Однократная глубокая уборка для любого случая",
    "description_ka": "ერთჯერადი ღრმა დასუფავება ნებისმიერი შემთხვევისთვის",
    "price_per_hour": 21.9,
    "enabled": true
  }
];

const embeddedCities = [
  {
    "id": 1,
    "name": "Rome",
    "name_it": "Roma",
    "name_ru": "Рим",
    "name_ka": "რომი",
    "enabled": true,
    "working_days": "1,2,3,4,5,6,7",
    "working_hours_start": "09:00",
    "working_hours_end": "17:30"
  }
];

const serviceIcons = {
  'Regular Cleaning': 'fa-broom',
  'One-time Cleaning': 'fa-calendar-check',
  'Deep Cleaning': 'fa-water',
  'Move-in/Move-out': 'fa-truck-moving',
  'Last-minute Cleaning': 'fa-clock',
  'Business Cleaning': 'fa-building'
};

const addonMapping = {
  'One-time Cleaning': [],
  'Regular Cleaning': [
    'fridge-cleaning','limescale-removal','dishwashing','ironing','balcony-cleaning',
    'window-cleaning','laundry-service','gardening','carpet-cleaning'
  ],
  'Deep Cleaning': [
    'fridge-cleaning','limescale-removal','dishwashing','ironing','balcony-cleaning',
    'window-cleaning','laundry-service','gardening','carpet-cleaning','oven-cleaning',
    'mold-removal','steam-cleaning','wall-stain-removal','sofa-cleaning','mattress-cleaning'
  ]
};

const ALL_ADDONS = [
  'fridge-cleaning','limescale-removal','dishwashing','ironing','balcony-cleaning',
  'window-cleaning','laundry-service','gardening','carpet-cleaning','oven-cleaning',
  'mold-removal','steam-cleaning','wall-stain-removal','sofa-cleaning','mattress-cleaning'
];

const SUPPLY_PRICES = {
  'provide-solvents': 5.00,
  'provide-mop': 3.00,
  'provide-vacuum': 7.00,
};

// =======================
// FILTER ADDONS
// =======================

function filterAddonsForService(service) {
  const allowed = service && addonMapping[service.name]
    ? addonMapping[service.name]
    : ALL_ADDONS.slice();

  ALL_ADDONS.forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;

    if (allowed.includes(id)) {
      input.disabled = false;
    } else {
      input.checked = false;
      input.disabled = true;
    }
  });
}

// =======================
// DOM LOADED
// =======================

document.addEventListener('DOMContentLoaded', async () => {
  await loadServices();
  await loadCities();
  initStripe();
  initDatePicker();
  initCookieBanner();

  document.getElementById('city-select').addEventListener('change', onCityChange);
  document.getElementById('date-input').addEventListener('change', onDateChange);
  document.getElementById('service-select').addEventListener('change', onServiceChange);
  document.getElementById('hours-select').addEventListener('change', updatePrice);
  document.getElementById('cleaners-select').addEventListener('change', updatePrice);

  document.getElementById('booking-form').addEventListener('submit', handleBookingSubmit);
});

// =======================
// LOAD SERVICES (FIXED)
// =======================

async function loadServices() {
  try {
    const response = await fetch('/api/services');

    if (!response.ok) {
      throw new Error('API failed');
    }

    services = await response.json();
  } catch {
    console.log('Using embedded services');
    services = embeddedServices;
  }

  const select = document.getElementById('service-select');
  select.innerHTML = `<option value="">Select a service</option>`;

  services.forEach(service => {
    const option = document.createElement('option');
    option.value = service.id;
    option.textContent = service.name;
    select.appendChild(option);
  });
}

// =======================
// LOAD CITIES (FIXED)
// =======================

async function loadCities() {
  try {
    const response = await fetch('/api/cities');

    if (!response.ok) {
      throw new Error('API failed');
    }

    cities = await response.json();
  } catch {
    console.log('Using embedded cities');
    cities = embeddedCities;
  }

  const select = document.getElementById('city-select');
  select.innerHTML = `<option value="">Select a city</option>`;

  cities.forEach(city => {
    const option = document.createElement('option');
    option.value = city.id;
    option.textContent = city.name;
    select.appendChild(option);
  });
}

// =======================
// NEW FIX: SERVICE CHANGE
// =======================

function onServiceChange(e) {
  const serviceId = parseInt(e.target.value);

  selectedService = services.find(s => s.id === serviceId) || null;

  filterAddonsForService(selectedService);
  updatePrice();
}

// =======================
// PLACEHOLDER FUNCTIONS (რომ არ აგდოს შეცდომა)
// =======================

function onCityChange() {}
function onDateChange() {}

// =======================
// DATE PICKER
// =======================

function initDatePicker() {
  const dateInput = document.getElementById('date-input');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  dateInput.min = tomorrow.toISOString().split('T')[0];
}

// =======================
// STRIPE
// =======================

function initStripe() {
  const stripeKey = 'pk_test_YOUR_REAL_KEY_HERE';

  stripe = Stripe(stripeKey);
  const elements = stripe.elements();

  cardElement = elements.create('card');
  cardElement.mount('#stripe-card-element');

  cardElement.on('change', (event) => {
    const displayError = document.getElementById('card-errors');
    if (event.error) {
      displayError.textContent = event.error.message;
      cardComplete = false;
    } else {
      displayError.textContent = '';
      cardComplete = event.complete;
    }
  });
}

// =======================
// PRICE CALCULATION
// =======================

function updatePrice() {
  const hours = parseInt(document.getElementById('hours-select').value) || 4;
  const cleaners = parseInt(document.getElementById('cleaners-select').value) || 1;
  const pricePerHour = selectedService
    ? parseFloat(selectedService.price_per_hour)
    : 25;

  let total = pricePerHour * hours * cleaners;

  let suppliesTotal = 0;
  Object.keys(SUPPLY_PRICES).forEach(id => {
    const el = document.getElementById(id);
    if (el && el.checked) suppliesTotal += SUPPLY_PRICES[id];
  });

  total += suppliesTotal;

  document.getElementById('total-price').textContent = `€${total.toFixed(2)}`;

  return { total, suppliesTotal };
}

// =======================
// SUBMIT BOOKING
// =======================

async function handleBookingSubmit(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading"></span>';

  try {
    const { total: totalAmount } = updatePrice();

    if (!selectedService) {
      throw new Error('Please select a service first');
    }

    if (totalAmount <= 0) {
      throw new Error('Invalid amount');
    }

    if (!cardComplete) {
      throw new Error('Complete card details first');
    }

    const paymentResponse = await fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Math.round(totalAmount * 100) })
    });

    const { clientSecret, paymentIntentId } = await paymentResponse.json();

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
        billing_details: {
          name: document.getElementById('name-input').value,
          email: document.getElementById('email-input').value,
        }
      }
    });

    if (error) throw new Error(error.message);
    if (paymentIntent.status !== 'succeeded') throw new Error('Payment failed');

    const bookingData = {
      serviceId: document.getElementById('service-select').value,
      cityId: document.getElementById('city-select').value,
      customerName: document.getElementById('name-input').value,
      customerEmail: document.getElementById('email-input').value,
      totalAmount: totalAmount,
      paymentIntentId: paymentIntentId
    };

    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData)
    });

    if (!response.ok) throw new Error('Booking failed');

    document.getElementById('booking-form').style.display = 'none';
    document.getElementById('booking-success').style.display = 'block';

  } catch (error) {
    alert(error.message);
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Confirm Booking';
  }
}
