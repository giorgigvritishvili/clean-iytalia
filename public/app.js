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
  'Move-in/Move-Out': [
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
      select.appendChild(option);

      const icon = serviceIcons[service.name] || 'fa-sparkles';
      const card = document.createElement('div');
      card.className = 'service-card';
      card.dataset.id = service.id;

      card.innerHTML = `
        <div class="service-icon">
          <i class="fas ${icon}"></i>
        </div>
        <h3>${service.name}</h3>
        <p>${service.description || ''}</p>
        <div class="service-price">€${parseFloat(service.price_per_hour).toFixed(2)} / hour</div>
      `;

      card.addEventListener('click', () => selectServiceCard(service.id));
      grid.appendChild(card);
    });
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

function initStripe() {
  const stripeKey = "pk_live_51SmjBDKEJbAqCpEexQl7XBODjKtclKaI2zZbZA1Uo1o7ERRtemy2EBwD7hc3rXxb6Zk803ER19oN45cSKvKxE6Ah00MiBtYW9g";

  stripe = Stripe(stripeKey);
  const elements = stripe.elements();

  cardElement = elements.create('card', {
    style: {
      base: {
        fontSize: '16px',
        color: '#32325d',
      }
    }
  });

  cardElement.mount('#stripe-card-element');

  cardElement.on('change', (event) => {
    const displayError = document.getElementById('card-errors');
    displayError.textContent = event.error ? event.error.message : '';
  });
}

function updatePrice() {
  const hours = parseInt(document.getElementById('hours-select').value) || 4;
  const cleaners = parseInt(document.getElementById('cleaners-select').value) || 1;

  let pricePerHour = selectedService ? parseFloat(selectedService.price_per_hour) : 25;
  let total = pricePerHour * hours * cleaners;

  Object.keys(SUPPLY_PRICES).forEach(id => {
    const el = document.getElementById(id);
    if (el && el.checked) total += SUPPLY_PRICES[id];
  });

  document.getElementById('total-price').textContent = `€${total.toFixed(2)}`;
  return total;
}

async function handleBookingSubmit(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading"></span>';

  try {
    const totalAmount = updatePrice();

    // 💡 IMPORTANT: Stripe expects amount in CENTS
    const amountInCents = Math.round(totalAmount * 100);

    const paymentResponse = await fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountInCents }),
    });

    if (!paymentResponse.ok) {
      throw new Error("Payment failed on server");
    }

    const { clientSecret } = await paymentResponse.json();

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

    if (error) {
      throw new Error(error.message);
    }

    const bookingData = {
      serviceId: document.getElementById('service-select').value,
      cityId: document.getElementById('city-select').value,
      customerName: document.getElementById('name-input').value,
      customerEmail: document.getElementById('email-input').value,
      customerPhone: document.getElementById('phone-input').value,
      bookingDate: document.getElementById('date-input').value,
      bookingTime: document.getElementById('time-select').value,
      hours: document.getElementById('hours-select').value,
      cleaners: document.getElementById('cleaners-select').value,
      totalAmount: totalAmount,
    };

    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData),
    });

    if (!response.ok) {
      throw new Error('Failed to create booking');
    }

    document.getElementById('booking-form').style.display = 'none';
    document.getElementById('booking-success').style.display = 'block';

  } catch (error) {
    console.error('Booking error:', error);
    alert('Payment or booking failed. Try again.');
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Confirm Booking';
  }
}
