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
    
    services.forEach(service => {
      const option = document.createElement('option');
      option.value = service.id;
      option.textContent = currentLanguage === 'it' ? service.name_it : service.name;
      option.dataset.price = service.price_per_hour;
      select.appendChild(option);
      
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
        <div class="service-price">€${parseFloat(service.price_per_hour).toFixed(2)} <span>${currentLanguage === 'it' ? '/ora' : '/hour'}</span></div>
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
    cities.forEach(city => {
      const option = document.createElement('option');
      option.value = city.id;
      option.textContent = currentLanguage === 'it' ? city.name_it : city.name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading cities:', error);
  }
}

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
    timeSelect.innerHTML = `<option value="">${currentLanguage === 'it' ? 'Seleziona prima una data' : 'Select a date first'}</option>`;
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
  const stripeKey = 'pk_test_placeholder';
  
  try {
    stripe = Stripe(stripeKey);
    const elements = stripe.elements();
    
    cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#1E293B',
          '::placeholder': {
            color: '#64748B',
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

  const summary = document.getElementById('booking-summary');
  summary.innerHTML = `
    <div class="summary-item">
      <span class="summary-label">${currentLanguage === 'it' ? 'Servizio' : 'Service'}:</span>
      <span class="summary-value">${currentLanguage === 'it' ? service?.name_it : service?.name}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${currentLanguage === 'it' ? 'Città' : 'City'}:</span>
      <span class="summary-value">${currentLanguage === 'it' ? city?.name_it : city?.name}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${currentLanguage === 'it' ? 'Data' : 'Date'}:</span>
      <span class="summary-value">${date}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${currentLanguage === 'it' ? 'Ora' : 'Time'}:</span>
      <span class="summary-value">${time}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${currentLanguage === 'it' ? 'Durata' : 'Duration'}:</span>
      <span class="summary-value">${hours} ${currentLanguage === 'it' ? 'ore' : 'hours'}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${currentLanguage === 'it' ? 'Addetti' : 'Cleaners'}:</span>
      <span class="summary-value">${cleaners}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${currentLanguage === 'it' ? 'Indirizzo' : 'Address'}:</span>
      <span class="summary-value">${streetName} ${houseNumber}${doorbellName ? ', ' + doorbellName : ''}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Property Size:</span>
      <span class="summary-value">${propertySize} sqm</span>
    </div>
    ${additionalServices.length > 0 ? `
    <div class="summary-item">
      <span class="summary-label">Additional Services:</span>
      <span class="summary-value">${additionalServices.join(', ')}</span>
    </div>
    ` : ''}
    ${supplies.length > 0 ? `
    <div class="summary-item">
      <span class="summary-label">Supplies Provided:</span>
      <span class="summary-value">${supplies.join(', ')}</span>
    </div>
    ` : ''}
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
    let paymentIntentId = null;
    
    if (stripe && cardElement) {
      try {
        const paymentResponse = await fetch('/api/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: totalAmount }),
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
          
          if (error) {
            throw new Error(error.message);
          }
        }
      } catch (stripeError) {
        console.log('Stripe payment skipped:', stripeError.message);
        paymentIntentId = 'demo_' + Date.now();
      }
    } else {
      paymentIntentId = 'demo_' + Date.now();
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
      ? 'Errore nella prenotazione. Riprova.' 
      : 'Error creating booking. Please try again.');
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
