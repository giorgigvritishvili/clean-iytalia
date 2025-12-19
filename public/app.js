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

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize translations and pass a callback to re-render content on language change
  initTranslations(renderDynamicContent);
  
  initEventListeners();
  initStripe();
  initDatePicker();
  initCookieBanner();

  // Initial load of data
  await fetchData();
});

async function fetchData() {
  try {
    const [servicesRes, citiesRes] = await Promise.all([
      fetch('/api/services'),
      fetch('/api/cities')
    ]);
    services = await servicesRes.json();
    cities = await citiesRes.json();
    renderDynamicContent();
  } catch (error) {
    console.error('Error fetching initial data:', error);
  }
}

function renderDynamicContent() {
  renderServices();
  renderCities();
  // Re-translate any other dynamic parts of the UI if necessary
  updatePrice();
  if (document.querySelector('.form-step.active')?.id === 'step-4') {
    updateSummary();
  }
}

function initEventListeners() {
  // Navigation
  document.getElementById('mobile-menu-btn')?.addEventListener('click', toggleMobileMenu);

  // Booking Form
  document.getElementById('city-select')?.addEventListener('change', onCityChange);
  document.getElementById('date-input')?.addEventListener('change', onDateChange);
  document.getElementById('service-select')?.addEventListener('change', onServiceChange);
  document.getElementById('hours-select')?.addEventListener('change', updatePrice);
  document.getElementById('cleaners-select')?.addEventListener('change', updatePrice);
  
  document.getElementById('booking-form')?.addEventListener('submit', handleBookingSubmit);
  document.getElementById('new-booking-btn')?.addEventListener('click', resetBooking);

  // Form Step Navigation
  document.querySelectorAll('[data-step-target]').forEach(button => {
    button.addEventListener('click', (e) => {
      const targetStep = e.currentTarget.dataset.stepTarget;
      const currentStep = e.currentTarget.closest('.form-step').id.split('-')[1];
      
      if (parseInt(targetStep) > parseInt(currentStep)) {
        nextStep(parseInt(targetStep));
      } else {
        prevStep(parseInt(targetStep));
      }
    });
  });

  // FAQ
  document.querySelectorAll('.faq-question').forEach(button => {
    button.addEventListener('click', () => toggleFaq(button));
  });

  // Cookie Banner
  document.getElementById('accept-cookies-btn')?.addEventListener('click', acceptCookies);
  document.getElementById('decline-cookies-btn')?.addEventListener('click', declineCookies);
}

function renderServices() {
  const select = document.getElementById('service-select');
  const grid = document.getElementById('services-grid');
  
  // Preserve selected value
  const selectedValue = select.value;
  
  select.innerHTML = `<option value="">${i18n('booking.selectService')}</option>`;
  grid.innerHTML = '';
  
  services.forEach(service => {
    // Populate dropdown
    const option = document.createElement('option');
    option.value = service.id;
    option.textContent = currentLanguage === 'it' ? service.name_it : service.name;
    option.dataset.price = service.price_per_hour;
    select.appendChild(option);
    
    // Populate grid
    const icon = serviceIcons[service.name] || 'fa-sparkles';
    const card = document.createElement('div');
    card.className = 'service-card';
    card.dataset.id = service.id;
    card.innerHTML = `
      <div class="service-icon">
        <i class="fas ${icon}"></i>
      </div>
      <h3>${currentLanguage === 'it' ? service.name_it : service.name}</h3>
      <p>${currentLanguage === 'it' ? (service.description_it || service.description) : service.description}</p>
      <div class="service-price">€${parseFloat(service.price_per_hour).toFixed(2)} <span>${i18n('services.perHour')}</span></div>
    `;
    card.addEventListener('click', () => selectServiceCard(service.id));
    grid.appendChild(card);
  });
  
  // Restore selected value if it still exists
  select.value = selectedValue;
  if (select.value) {
    document.querySelector(`.service-card[data-id="${select.value}"]`)?.classList.add('selected');
  }
}

function renderCities() {
  const select = document.getElementById('city-select');
  const selectedValue = select.value;
  select.innerHTML = `<option value="">${i18n('booking.selectCity')}</option>`;
  
  cities.forEach(city => {
    const option = document.createElement('option');
    option.value = city.id;
    option.textContent = currentLanguage === 'it' ? city.name_it : city.name;
    select.appendChild(option);
  });
  
  select.value = selectedValue;
}

function selectServiceCard(serviceId) {
  document.querySelectorAll('.service-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  const card = document.querySelector(`.service-card[data-id="${serviceId}"]`);
  card?.classList.add('selected');
  
  document.getElementById('service-select').value = serviceId;
  selectedService = services.find(s => s.id === parseInt(serviceId));
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
    timeSelect.innerHTML = `<option value="">${i18n('booking.selectDate')}</option>`;
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
      timeSelect.innerHTML = `<option value="">${i18n('booking.noSlots')}</option>`;
    }
  } catch (error) {
    console.error('Error loading time slots:', error);
    timeSelect.innerHTML = `<option value="">${i18n('booking.errorSlots')}</option>`;
  }
}

function updatePrice() {
  const hours = parseInt(document.getElementById('hours-select').value) || 0;
  const cleaners = parseInt(document.getElementById('cleaners-select').value) || 0;
  
  const serviceId = document.getElementById('service-select').value;
  const service = services.find(s => s.id === parseInt(serviceId));
  const pricePerHour = service ? parseFloat(service.price_per_hour) : 0;
  
  const total = pricePerHour * hours * cleaners;
  document.getElementById('total-price').textContent = `€${total.toFixed(2)}`;
  
  return total;
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
  const stripeKey = 'pk_test_placeholder'; // This should be fetched from a config endpoint
  
  try {
    stripe = Stripe(stripeKey);
    const elements = stripe.elements();
    
    cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#1E293B',
          '::placeholder': { color: '#64748B' },
        },
        invalid: { color: '#EF4444' },
      },
    });
    
    cardElement.mount('#stripe-card-element');
    
    cardElement.on('change', (event) => {
      const displayError = document.getElementById('card-errors');
      displayError.textContent = event.error ? event.error.message : '';
    });
  } catch (error) {
    console.log('Stripe initialization skipped - booking will run in demo mode.');
  }
}

function nextStep(step) {
  const currentStep = document.querySelector('.form-step.active');
  const currentStepNum = parseInt(currentStep.id.split('-')[1]);
  
  if (!validateStep(currentStepNum)) return;
  
  if (step === 4) updateSummary();
  
  currentStep.classList.remove('active');
  document.getElementById(`step-${step}`).classList.add('active');
}

function prevStep(step) {
  document.querySelector('.form-step.active').classList.remove('active');
  document.getElementById(`step-${step}`).classList.add('active');
}

function validateStep(step) {
  let isValid = true;
  switch (step) {
    case 1:
      if (!document.getElementById('service-select').value) {
        alert(i18n('booking.validation.selectService'));
        isValid = false;
      } else if (!document.getElementById('city-select').value) {
        alert(i18n('booking.validation.selectCity'));
        isValid = false;
      }
      break;
    case 2:
      if (!document.getElementById('date-input').value) {
        alert(i18n('booking.validation.selectDate'));
        isValid = false;
      } else if (!document.getElementById('time-select').value) {
        alert(i18n('booking.validation.selectTime'));
        isValid = false;
      }
      break;
    case 3:
      const name = document.getElementById('name-input').value.trim();
      const email = document.getElementById('email-input').value.trim();
      const phone = document.getElementById('phone-input').value.trim();
      const address = document.getElementById('address-input').value.trim();
      
      if (!name || !email || !phone || !address) {
        alert(i18n('booking.validation.fillAllFields'));
        isValid = false;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert(i18n('booking.validation.validEmail'));
        isValid = false;
      }
      break;
  }
  return isValid;
}

function updateSummary() {
  const service = services.find(s => s.id === parseInt(document.getElementById('service-select').value));
  const city = cities.find(c => c.id === parseInt(document.getElementById('city-select').value));
  const hours = document.getElementById('hours-select').value;
  const cleaners = document.getElementById('cleaners-select').value;
  const date = document.getElementById('date-input').value;
  const time = document.getElementById('time-select').value;
  const address = document.getElementById('address-input').value;
  
  const summary = document.getElementById('booking-summary');
  if (!summary || !service || !city) return;

  summary.innerHTML = `
    <div class="summary-item">
      <span class="summary-label">${i18n('booking.summary.service')}:</span>
      <span class="summary-value">${currentLanguage === 'it' ? service.name_it : service.name}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${i18n('booking.summary.city')}:</span>
      <span class="summary-value">${currentLanguage === 'it' ? city.name_it : city.name}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${i18n('booking.summary.date')}:</span>
      <span class="summary-value">${date}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${i18n('booking.summary.time')}:</span>
      <span class="summary-value">${time}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${i18n('booking.summary.duration')}:</span>
      <span class="summary-value">${hours} ${i18n('booking.summary.hours')}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${i18n('booking.summary.cleaners')}:</span>
      <span class="summary-value">${cleaners}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${i18n('booking.summary.address')}:</span>
      <span class="summary-value">${address}</span>
    </div>
  `;
  
  updatePrice();
}

async function handleBookingSubmit(e) {
  e.preventDefault();
  
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading"></span>';
  
  try {
    const totalAmount = updatePrice();
    let paymentIntentId = 'demo_' + Date.now(); // Default to demo mode
    
    if (stripe && cardElement) {
      // Attempt to create a real payment intent
      const paymentResponse = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: totalAmount }),
      });
      
      if (!paymentResponse.ok) {
        throw new Error('Could not create payment intent.');
      }
        
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
      
      if (error) {
        throw new Error(error.message);
      }
    }
    
    const bookingData = {
      serviceId: document.getElementById('service-select').value,
      cityId: document.getElementById('city-select').value,
      customerName: document.getElementById('name-input').value,
      customerEmail: document.getElementById('email-input').value,
      customerPhone: document.getElementById('phone-input').value,
      customerAddress: document.getElementById('address-input').value,
      bookingDate: document.getElementById('date-input').value,
      bookingTime: document.getElementById('time-select').value,
      hours: document.getElementById('hours-select').value,
      cleaners: document.getElementById('cleaners-select').value,
      totalAmount: totalAmount,
      paymentIntentId: paymentIntentId,
      notes: document.getElementById('notes-input').value,
    };
    
    const bookingResponse = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData),
    });
    
    if (!bookingResponse.ok) {
      throw new Error('Failed to create booking on the server.');
    }
    
    document.getElementById('booking-form').style.display = 'none';
    document.getElementById('booking-success').style.display = 'block';
    
  } catch (error) {
    console.error('Booking error:', error);
    alert(i18n('booking.validation.bookingError'));
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fas fa-lock"></i><span>${i18n('booking.confirm')}</span>`;
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
  
  document.getElementById('time-select').innerHTML = `<option value="">${i18n('booking.selectDate')}</option>`;
  
  updatePrice();
  cardElement.clear();
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
  const banner = document.getElementById('cookie-banner');
  if (!consent && banner) {
    banner.classList.add('active');
  }
}

function acceptCookies() {
  localStorage.setItem('cookieConsent', 'accepted');
  document.getElementById('cookie-banner')?.classList.remove('active');
}

function declineCookies() {
  localStorage.setItem('cookieConsent', 'declined');
  document.getElementById('cookie-banner')?.classList.remove('active');
}
