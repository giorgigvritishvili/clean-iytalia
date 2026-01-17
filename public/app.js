let currentLanguage = 'en';
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

// Mapping of which additional-service checkboxes are allowed per main service name.
// Keys use the English service names returned by the /api/services objects (service.name).
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

// All addon IDs present in the form (keeps a single source of truth)
const ALL_ADDONS = [
  'fridge-cleaning','limescale-removal','dishwashing','ironing','balcony-cleaning',
  'window-cleaning','laundry-service','gardening','carpet-cleaning','oven-cleaning',
  'mold-removal','steam-cleaning','wall-stain-removal','sofa-cleaning','mattress-cleaning'
];

// Prices for supplies (added to the booking total when selected)
const SUPPLY_PRICES = {
  'provide-solvents': 5.00,
  'provide-mop': 3.00,
  'provide-vacuum': 7.00,
};

// Enable/disable additional-service checkboxes based on the selected main service.
function filterAddonsForService(service) {
  // If service is null, enable all addons (used on reset)
  const allowed = service && addonMapping[service.name] ? addonMapping[service.name] : ALL_ADDONS.slice();

  // Decide the unavailable-note text based on selected service
  let noteText = null;
  if (service && typeof service.name === 'string') {
    if (service.name === 'Regular Cleaning' || service.name === 'Regular Basic Cleaning' || service.name.toLowerCase().includes('regular')) {
      noteText = 'Not available with Regular Basic Cleaning';
    } else if (service.name === 'Business Cleaning' || service.name.toLowerCase().includes('business')) {
      noteText = 'Not available with Cleaning For Business';
    }
  }

  ALL_ADDONS.forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    const label = input.closest('label') || input.parentElement;
    // Keep a reference to the label's original text so we can restore it
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

      // If a noteText is defined for the selected service, append it to disabled addon labels
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
    // clear existing before repopulating (allows language reload)
    select.innerHTML = `<option value="" data-i18n="booking.selectService">Select a service</option>`;
    grid.innerHTML = '';

    // helper to pick localized fields from service objects (e.g. name_it, name_ru)
    function getLocalizedField(obj, base, lang) {
      if (!obj) return '';
      const key = `${base}_${lang}`;
      if (obj[key]) return obj[key];
      // prefer English fallback when available
      if (obj[base]) return obj[base];
      // then Italian
      if (obj[`${base}_it`]) return obj[`${base}_it`];
      return '';
    }

    services.forEach(service => {
      const option = document.createElement('option');
      option.value = service.id;
      option.textContent = getLocalizedField(service, 'name', currentLanguage);
      option.dataset.price = service.price_per_hour;
      select.appendChild(option);

      const icon = serviceIcons[service.name] || 'fa-sparkles';
      const card = document.createElement('div');
      card.className = 'service-card';
      card.dataset.id = service.id;
      const serviceName = getLocalizedField(service, 'name', currentLanguage);
      const serviceDescription = getLocalizedField(service, 'description', currentLanguage) || service.description || '';
      const hourLabel = currentLanguage === 'it' ? '/ora' : '/hour';
      card.innerHTML = `
        <div class="service-icon">
          <i class="fas ${icon}"></i>
        </div>
        <h3>${serviceName}</h3>
        <p>${serviceDescription}</p>
        <div class="service-price">€${parseFloat(service.price_per_hour).toFixed(2)} <span>${hourLabel}</span></div>
      `;
      card.addEventListener('click', () => selectServiceCard(service.id));
      grid.appendChild(card);
    });
    // If a service is already selected (e.g., on language reload), apply addon filtering
    const currentServiceId = document.getElementById('service-select')?.value;
    if (currentServiceId) {
      selectedService = services.find(s => s.id === parseInt(currentServiceId));
      try { filterAddonsForService(selectedService); } catch (e) { console.warn('filterAddonsForService error', e); }
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
    // clear and repopulate so language changes take effect
    select.innerHTML = `<option value="" data-i18n="booking.selectCity">Select a city</option>`;
    cities.forEach(city => {
      const option = document.createElement('option');
      option.value = city.id;
      const nameKey = `name_${currentLanguage}`;
      option.textContent = city[nameKey] || city.name || city.name_it || '';
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading cities:', error);
  }
}

// Called by translations.js when language changes
window.onLanguageChange = function(lang) {
  try {
    currentLanguage = lang;
    // reload dynamic lists so labels update
    loadServices();
    loadCities();

    // update time placeholder if no date selected
    const timeSelect = document.getElementById('time-select');
    if (timeSelect && !timeSelect.value) {
      timeSelect.innerHTML = `<option value="" data-i18n="booking.selectDate">Select a date first</option>`;
    }

    // refresh summary texts if visible
    try { updateSummary(); } catch (e) {}
  } catch (e) {
    console.error('Language change handler error', e);
  }
};

function selectServiceCard(serviceId) {
  document.querySelectorAll('.service-card').forEach(card => {
    card.classList.remove('selected');
  });

  const card = document.querySelector(`.service-card[data-id="${serviceId}"]`);
  if (card) {
    card.classList.add('selected');
  }

  document.getElementById('service-select').value = serviceId;
  selectedService = services.find(s => s.id === parseInt(serviceId));
  // filter available addons for the selected service
  try { filterAddonsForService(selectedService); } catch (e) { console.warn('filterAddonsForService error', e); }
  updatePrice();

  document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
}

function onServiceChange() {
  const serviceId = document.getElementById('service-select').value;
  selectedService = services.find(s => s.id === parseInt(serviceId));

  document.querySelectorAll('.service-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.id === serviceId);
  });

  updatePrice();
  // filter available addons when service changes
  try { filterAddonsForService(selectedService); } catch (e) { console.warn('filterAddonsForService error', e); }
}

function onCityChange() {
  const dateInput = document.getElementById('date-input');
  if (dateInput.value) {
    onDateChange();
  }
}

async function onDateChange() {
  const cityId = document.getElementById('city-select').value;
  const date = document.getElementById('date-input').value;
  const timeSelect = document.getElementById('time-select');

  if (!cityId || !date) {
    timeSelect.innerHTML = `<option value="" data-i18n="booking.selectDate">Select a date first</option>`;
    return;
  }

  try {
    const response = await fetch(`/api/available-slots?cityId=${cityId}&date=${date}`);
    const data = await response.json();

    timeSelect.innerHTML = '';

    if (data.slots && data.slots.length > 0) {
      data.slots.forEach(slot => {
        const option = document.createElement('option');
        option.value = slot;
        option.textContent = slot;
        timeSelect.appendChild(option);
      });
    } else {
      timeSelect.innerHTML = `<option value="">${currentLanguage === 'it' ? 'Nessun orario disponibile' : 'No available time slots'}</option>`;
    }
  } catch (error) {
    console.error('Error loading time slots:', error);
    timeSelect.innerHTML = `<option value="">${currentLanguage === 'it' ? 'Errore nel caricamento' : 'Error loading slots'}</option>`;
  }
}

function updatePrice() {
  const hours = parseInt(document.getElementById('hours-select').value) || 4;
  const cleaners = parseInt(document.getElementById('cleaners-select').value) || 1;
  const pricePerHour = selectedService ? parseFloat(selectedService.price_per_hour) : 25;

  let total = pricePerHour * hours * cleaners;

  // Add supplies cost if selected
  let suppliesTotal = 0;
  Object.keys(SUPPLY_PRICES).forEach(id => {
    const el = document.getElementById(id);
    if (el && el.checked) suppliesTotal += SUPPLY_PRICES[id];
  });

  total += suppliesTotal;

  document.getElementById('total-price').textContent = `€${total.toFixed(2)}`;

  // expose suppliesTotal for callers if needed
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
  const stripeKey = 'pk_live_51On327KDzD216p6O8qTstfN5X8j7w8j7w8j7w8j7w8j7w8j7w8j7w8j7w8j7w8j7';

  try {
    stripe = Stripe(stripeKey, {
      locale: currentLanguage === 'ka' ? 'en' : currentLanguage
    });
    const elements = stripe.elements();

    cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#5F6368',
          '::placeholder': {
            color: '#7A8C99',
          },
        },
        invalid: {
          color: '#EF4444',
        },
      },
    });

    cardElement.mount('#stripe-card-element');

    cardElement.on('change', (event) => {
      const displayError = document.getElementById('card-errors');
      if (event.error) {
        displayError.textContent = event.error.message;
      } else {
        displayError.textContent = '';
      }
    });
  } catch (error) {
    console.log('Stripe initialization skipped - will use demo mode');
  }
}

function nextStep(step) {
  const currentStep = document.querySelector('.form-step.active');
  const currentStepNum = parseInt(currentStep.id.split('-')[1]);

  if (!validateStep(currentStepNum)) {
    return;
  }

  if (step === 4) {
    updateSummary();
  }

  currentStep.classList.remove('active');
  document.getElementById(`step-${step}`).classList.add('active');
}

function prevStep(step) {
  document.querySelector('.form-step.active').classList.remove('active');
  document.getElementById(`step-${step}`).classList.add('active');
}

function validateStep(step) {
  switch (step) {
    case 1:
      if (!document.getElementById('service-select').value) {
        alert(currentLanguage === 'it' ? 'Seleziona un servizio' : 'Please select a service');
        return false;
      }
      if (!document.getElementById('city-select').value) {
        alert(currentLanguage === 'it' ? 'Seleziona una città' : 'Please select a city');
        return false;
      }
      return true;

    case 2:
      if (!document.getElementById('date-input').value) {
        alert(currentLanguage === 'it' ? 'Seleziona una data' : 'Please select a date');
        return false;
      }
      if (!document.getElementById('time-select').value) {
        alert(currentLanguage === 'it' ? 'Seleziona un orario' : 'Please select a time');
        return false;
      }
      return true;

    case 3:
      const name = document.getElementById('name-input').value.trim();
      const email = document.getElementById('email-input').value.trim();
      const phone = document.getElementById('phone-input').value.trim();
      const streetName = document.getElementById('street-name-input').value.trim();
      const houseNumber = document.getElementById('house-number-input').value.trim();
      const propertySize = document.getElementById('property-size-input').value.trim();

      if (!name || !email || !phone || !streetName || !houseNumber || !propertySize) {
        alert(currentLanguage === 'it' ? 'Compila tutti i campi richiesti' : 'Please fill in all required fields');
        return false;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        alert(currentLanguage === 'it' ? 'Inserisci un email valido' : 'Please enter a valid email');
        return false;
      }
      return true;

    default:
      return true;
  }
}

function updateSummary() {
  const service = services.find(s => s.id === parseInt(document.getElementById('service-select').value));
  const city = cities.find(c => c.id === parseInt(document.getElementById('city-select').value));
  const hours = document.getElementById('hours-select').value;
  const cleaners = document.getElementById('cleaners-select').value;
  const date = document.getElementById('date-input').value;
  const time = document.getElementById('time-select').value;
  const streetName = document.getElementById('street-name-input').value;
  const houseNumber = document.getElementById('house-number-input').value;
  const propertySize = document.getElementById('property-size-input').value;
  const doorbellName = document.getElementById('doorbell-name-input').value;

  // Collect additional services
  const additionalServices = [];
  const serviceCheckboxes = [
    'fridge-cleaning', 'limescale-removal', 'dishwashing', 'ironing', 'balcony-cleaning',
    'window-cleaning', 'laundry-service', 'gardening', 'carpet-cleaning', 'oven-cleaning',
    'mold-removal', 'steam-cleaning', 'wall-stain-removal', 'sofa-cleaning', 'mattress-cleaning'
  ];
  serviceCheckboxes.forEach(id => {
    if (document.getElementById(id)?.checked) {
      const label = document.querySelector(`label[for="${id}"]`)?.textContent || id.replace(/-/g, ' ');
      additionalServices.push(label);
    }
  });

  // Collect supplies
  const supplies = [];
  const supplyCheckboxes = ['provide-solvents', 'provide-mop', 'provide-vacuum'];
  supplyCheckboxes.forEach(id => {
    if (document.getElementById(id)?.checked) {
      const label = document.querySelector(`label[for="${id}"]`)?.textContent || id.replace(/-/g, ' ');
      supplies.push(label);
    }
  });

  // calculate supplies total for display
  let suppliesTotalForDisplay = 0;
  supplyCheckboxes.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.checked && SUPPLY_PRICES[id]) suppliesTotalForDisplay += SUPPLY_PRICES[id];
  });

  const t = (typeof translations !== 'undefined' && translations[currentLanguage]) ? translations[currentLanguage] : translations['en'];
  const summary = document.getElementById('booking-summary');
  const serviceName = service ? (service[`name_${currentLanguage}`] || service.name_it || service.name) : '';
  const cityName = city ? (city[`name_${currentLanguage}`] || city.name_it || city.name) : '';
  const hoursLabel = t.booking && t.booking.hours ? t.booking.hours : 'Hours';
  const durationUnit = currentLanguage === 'it' ? 'ore' : (t.booking && t.booking.hoursOptions ? t.booking.hoursOptions['4']?.split(' ')[1] || 'hours' : 'hours');

  summary.innerHTML = `
    <div class="summary-item">
      <span class="summary-label">${t.booking && t.booking.service ? t.booking.service : 'Service'}:</span>
      <span class="summary-value">${serviceName}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${t.booking && t.booking.city ? t.booking.city : 'City'}:</span>
      <span class="summary-value">${cityName}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${t.booking && t.booking.date ? t.booking.date : 'Date'}:</span>
      <span class="summary-value">${date}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${t.booking && t.booking.time ? t.booking.time : 'Time'}:</span>
      <span class="summary-value">${time}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${t.booking && t.booking.hours ? t.booking.hours : 'Duration'}:</span>
      <span class="summary-value">${hours} ${durationUnit}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${t.booking && t.booking.cleaners ? t.booking.cleaners : 'Cleaners'}:</span>
      <span class="summary-value">${cleaners}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${t.booking && t.booking.placeholders && t.booking.placeholders.street ? t.booking.placeholders.street : 'Address'}:</span>
      <span class="summary-value">${streetName} ${houseNumber}${doorbellName ? ', ' + doorbellName : ''}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${t.booking && t.booking.propertySize ? t.booking.propertySize : 'Property Size'}:</span>
      <span class="summary-value">${propertySize} sqm</span>
    </div>
    ${additionalServices.length > 0 ? `
    <div class="summary-item">
      <span class="summary-label">${t.booking && t.booking.addons ? (t.booking.addonsTitle || 'Additional Services') : 'Additional Services'}:</span>
      <span class="summary-value">${additionalServices.join(', ')}</span>
    </div>
    ` : ''}
    ${supplies.length > 0 ? `
    <div class="summary-item">
      <span class="summary-label">${t.booking && t.booking.supplies ? 'Supplies Provided' : 'Supplies Provided'}:</span>
      <span class="summary-value">${supplies.join(', ')}${suppliesTotalForDisplay ? ' — €' + suppliesTotalForDisplay.toFixed(2) : ''}</span>
    </div>
    ` : ''}
  `;

  // refresh displayed total and capture supply total
  const priceInfo = updatePrice();
  // priceInfo.total and priceInfo.suppliesTotal are available if callers need them
}

async function handleBookingSubmit(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading"></span>';

  try {
    const { total: totalAmount } = updatePrice();
    let paymentIntentId = null;

    if (stripe && cardElement) {
      const paymentResponse = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: totalAmount }),
      });

      if (!paymentResponse.ok) {
        const errorData = await paymentResponse.json();
        throw new Error(errorData.error || 'Failed to create payment intent');
      }

      const { clientSecret, paymentIntentId: piId } = await paymentResponse.json();
      paymentIntentId = piId;

      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
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

      // We are using capture_method: 'manual', so status will be 'requires_capture'
      if (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'requires_capture') {
        throw new Error('Payment authorization failed: ' + paymentIntent.status);
      }
    } else {
      throw new Error('Stripe is not initialized. Please check your publishable key.');
    }

    // Collect additional services
    const additionalServices = [];
    const serviceCheckboxes = [
      'fridge-cleaning', 'limescale-removal', 'dishwashing', 'ironing', 'balcony-cleaning',
      'window-cleaning', 'laundry-service', 'gardening', 'carpet-cleaning', 'oven-cleaning',
      'mold-removal', 'steam-cleaning', 'wall-stain-removal', 'sofa-cleaning', 'mattress-cleaning'
    ];
    serviceCheckboxes.forEach(id => {
      if (document.getElementById(id)?.checked) {
        additionalServices.push(id);
      }
    });

    // Collect supplies
    const supplies = [];
    const supplyCheckboxes = ['provide-solvents', 'provide-mop', 'provide-vacuum'];
    supplyCheckboxes.forEach(id => {
      if (document.getElementById(id)?.checked) {
        supplies.push(id);
      }
    });

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
      totalAmount: totalAmount,
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

    if (!response.ok) {
      throw new Error('Failed to create booking');
    }

    document.getElementById('booking-form').style.display = 'none';
    document.getElementById('booking-success').style.display = 'block';

  } catch (error) {
    console.error('Booking error:', error);
    alert(currentLanguage === 'it' 
      ? 'Errore nella prenotazione. Riprova: ' + error.message
      : 'Error creating booking. Please try again: ' + error.message);
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fas fa-lock"></i><span>${currentLanguage === 'it' ? 'Conferma Prenotazione' : 'Confirm Booking'}</span>`;
  }
}

function resetBooking() {
  document.getElementById('booking-form').reset();
  document.getElementById('booking-form').style.display = 'block';
  document.getElementById('booking-success').style.display = 'none';

  document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
  document.getElementById('step-1').classList.add('active');

  document.querySelectorAll('.service-card').forEach(card => card.classList.remove('selected'));
  selectedService = null;
  // re-enable all addons on reset
  try { filterAddonsForService(null); } catch (e) { console.warn('filterAddonsForService error', e); }

  document.getElementById('time-select').innerHTML = `<option value="">${currentLanguage === 'it' ? 'Seleziona prima una data' : 'Select a date first'}</option>`;

  updatePrice();
}

function toggleMobileMenu() {
  document.getElementById('mobile-menu').classList.toggle('active');
}

function toggleFaq(button) {
  const item = button.closest('.faq-item');
  item.classList.toggle('active');
}

function initCookieBanner() {
  const consent = localStorage.getItem('cookieConsent');
  if (!consent) {
    document.getElementById('cookie-banner').classList.add('active');
  }
}

function acceptCookies() {
  localStorage.setItem('cookieConsent', 'accepted');
  document.getElementById('cookie-banner').classList.remove('active');
}

function declineCookies() {
  localStorage.setItem('cookieConsent', 'declined');
  document.getElementById('cookie-banner').classList.remove('active');
}