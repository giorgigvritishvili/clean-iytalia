let services = [];
let cities = [];
let selectedService = null;
let stripe = null;
let cardElement = null;

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
  ],
  'Move-in/Move-out': [
    'fridge-cleaning','limescale-removal','dishwashing','ironing','balcony-cleaning',
    'window-cleaning','laundry-service','gardening','carpet-cleaning','oven-cleaning',
    'mold-removal','steam-cleaning','wall-stain-removal','sofa-cleaning','mattress-cleaning'
  ],
  'Last-minute Cleaning': [
    'dishwashing','fridge-cleaning','window-cleaning'
  ],
  'Business Cleaning': [
    'window-cleaning','carpet-cleaning','steam-cleaning','mold-removal','balcony-cleaning'
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

function filterAddonsForService(service) {
  const allowed = service && addonMapping[service.name] ? addonMapping[service.name] : ALL_ADDONS.slice();

  let noteText = null;
  if (service && typeof service.name === 'string') {
    if (service.name.toLowerCase().includes('regular')) {
      noteText = 'Not available with Regular Basic Cleaning';
    } else if (service.name.toLowerCase().includes('business')) {
      noteText = 'Not available with Cleaning For Business';
    }
  }

  ALL_ADDONS.forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    const label = input.closest('label') || input.parentElement;
    const labelSpan = label ? label.querySelector('span') : null;
    if (labelSpan && !labelSpan.dataset.originalText) {
      labelSpan.dataset.originalText = labelSpan.textContent.trim();
    }

    if (allowed.includes(id)) {
      input.disabled = false;
      if (label) label.classList.remove('disabled');
      if (labelSpan && labelSpan.dataset.originalText) {
        labelSpan.textContent = labelSpan.dataset.originalText;
      }
    } else {
      input.checked = false;
      input.disabled = true;
      if (label) label.classList.add('disabled');
      if (noteText && labelSpan && labelSpan.dataset.originalText) {
        labelSpan.textContent = `${labelSpan.dataset.originalText} — ${noteText}`;
      }
    }
  });
}

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

async function loadServices() {
  try {
    const response = await fetch('/api/services');
    services = await response.json();
    const select = document.getElementById('service-select');
    const grid = document.getElementById('services-grid');
    select.innerHTML = `<option value="">Select a service</option>`;
    grid.innerHTML = '';

    services.forEach(service => {
      const option = document.createElement('option');
      option.value = service.id;
      option.textContent = service.name;
      option.dataset.price = service.price_per_hour;
      select.appendChild(option);

      const icon = serviceIcons[service.name] || 'fa-sparkles';
      const card = document.createElement('div');
      card.className = 'service-card';
      card.dataset.id = service.id;
      card.innerHTML = `
        <div class="service-icon"><i class="fas ${icon}"></i></div>
        <h3>${service.name}</h3>
        <p>${service.description || ''}</p>
        <div class="service-price">€${parseFloat(service.price_per_hour).toFixed(2)} /hour</div>
      `;
      card.addEventListener('click', () => selectServiceCard(service.id));
      grid.appendChild(card);
    });

    const currentServiceId = document.getElementById('service-select')?.value;
    if (currentServiceId) {
      selectedService = services.find(s => s.id === parseInt(currentServiceId));
      filterAddonsForService(selectedService);
    }
  } catch (error) {
    console.error('Error loading services:', error);
  }
}

async function loadCities() {
  try {
    const response = await fetch('/api/cities');
    cities = await response.json();
    const select = document.getElementById('city-select');
    select.innerHTML = `<option value="">Select a city</option>`;
    cities.forEach(city => {
      const option = document.createElement('option');
      option.value = city.id;
      option.textContent = city.name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading cities:', error);
  }
}

function selectServiceCard(serviceId) {
  document.querySelectorAll('.service-card').forEach(card => card.classList.remove('selected'));
  const card = document.querySelector(`.service-card[data-id="${serviceId}"]`);
  if (card) card.classList.add('selected');
  document.getElementById('service-select').value = serviceId;
  selectedService = services.find(s => s.id === parseInt(serviceId));
  filterAddonsForService(selectedService);
  updatePrice();
}

function onServiceChange() {
  const serviceId = document.getElementById('service-select').value;
  selectedService = services.find(s => s.id === parseInt(serviceId));
  document.querySelectorAll('.service-card').forEach(card => card.classList.toggle('selected', card.dataset.id === serviceId));
  filterAddonsForService(selectedService);
  updatePrice();
}

function onCityChange() {
  if (document.getElementById('date-input').value) onDateChange();
}

async function onDateChange() {
  const cityId = document.getElementById('city-select').value;
  const date = document.getElementById('date-input').value;
  const timeSelect = document.getElementById('time-select');
  if (!cityId || !date) {
    timeSelect.innerHTML = `<option value="">Select a date first</option>`;
    return;
  }
  try {
    const response = await fetch(`/api/available-slots?cityId=${cityId}&date=${date}`);
    const data = await response.json();
    timeSelect.innerHTML = '';
    if (data.slots?.length > 0) {
      data.slots.forEach(slot => {
        const option = document.createElement('option');
        option.value = slot;
        option.textContent = slot;
        timeSelect.appendChild(option);
      });
    } else {
      timeSelect.innerHTML = `<option value="">No available time slots</option>`;
    }
  } catch (error) {
    console.error('Error loading time slots:', error);
    timeSelect.innerHTML = `<option value="">Error loading slots</option>`;
  }
}

function updatePrice() {
  const hours = parseInt(document.getElementById('hours-select').value) || 4;
  const cleaners = parseInt(document.getElementById('cleaners-select').value) || 1;
  const pricePerHour = selectedService ? parseFloat(selectedService.price_per_hour) : 25;
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

function initDatePicker() {
  const dateInput = document.getElementById('date-input');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  dateInput.min = tomorrow.toISOString().split('T')[0];
  const maxDate = new Date(today);
  maxDate.setMonth(maxDate.getMonth() + 3);
  dateInput.max = maxDate.toISOString().split('T')[0];
}

function initStripe() {
  const stripeKey = 'pk_test_placeholder';
  try {
    stripe = Stripe(stripeKey);
    const elements = stripe.elements();
    cardElement = elements.create('card', {
      style: {
        base: { fontSize: '16px', color: '#5F6368', '::placeholder': { color: '#7A8C99' } },
        invalid: { color: '#EF4444' },
      },
    });
    cardElement.mount('#stripe-card-element');
    cardElement.on('change', (event) => {
      const displayError = document.getElementById('card-errors');
      displayError.textContent = event.error ? event.error.message : '';
    });
  } catch (error) {
    console.log('Stripe initialization skipped - demo mode');
  }
}

async function handleBookingSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading"></span>';

  try {
    const { total } = updatePrice();
    const amountInCents = Math.round(total * 100);
    let paymentIntentId = null;

    if (stripe && cardElement) {
      const paymentResponse = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountInCents }),
      });
      if (paymentResponse.ok) {
        const { clientSecret, paymentIntentId: piId } = await paymentResponse.json();
        paymentIntentId = piId;
        const { error } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: cardElement,
            billing_details: {
              name: document.getElementById('name-input').value,
              email: document.getElementById('email-input').value,
              phone: document.getElementById('phone-input').value,
            },
          },
        });
        if (error) throw new Error(error.message);
      }
    } else {
      paymentIntentId = 'demo_' + Date.now();
    }

    const additionalServices = ALL_ADDONS.filter(id => document.getElementById(id)?.checked);
    const supplies = Object.keys(SUPPLY_PRICES).filter(id => document.getElementById(id)?.checked);

    const bookingData = {
      serviceId: document.getElementById('service-select').value,
      cityId: document.getElementById('city-select').value,
      customerName: document.getElementById('name-input').value,
      customerEmail: document.getElementById('email-input').value,
      customerPhone: document.getElementById('phone-input').value,
      streetName: document.getElementById('street-name-input').value,
      houseNumber: document.getElementById('house-number-input').value,
      propertySize: document.getElementById('property-size-input').value,
      doorbellName: document.getElementById('doorbell-name-input').value,
      bookingDate: document.getElementById('date-input').value,
      bookingTime: document.getElementById('time-select').value,
      hours: document.getElementById('hours-select').value,
      cleaners: document.getElementById('cleaners-select').value,
      totalAmount: total,
      paymentIntentId: paymentIntentId,
      notes: document.getElementById('notes-input').value,
      additionalServices: additionalServices,
      supplies: supplies,
    };

    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData),
    });
    if (!response.ok) throw new Error('Failed to create booking');

    document.getElementById('booking-form').style.display = 'none';
    document.getElementById('booking-success').style.display = 'block';
  } catch (error) {
    console.error('Booking error:', error);
    alert('Error creating booking. Please try again.');
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fas fa-lock"></i><span>Confirm Booking</span>`;
  }
}
