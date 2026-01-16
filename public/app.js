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
    'Regular Cleaning': ['fridge-cleaning','limescale-removal','dishwashing','ironing','balcony-cleaning','window-cleaning','laundry-service','gardening','carpet-cleaning'],
    'Deep Cleaning': ['fridge-cleaning','limescale-removal','dishwashing','ironing','balcony-cleaning','window-cleaning','laundry-service','gardening','carpet-cleaning','oven-cleaning','mold-removal','steam-cleaning','wall-stain-removal','sofa-cleaning','mattress-cleaning'],
    'Move-in/Move-out': ['fridge-cleaning','limescale-removal','dishwashing','ironing','balcony-cleaning','window-cleaning','laundry-service','gardening','carpet-cleaning','oven-cleaning','mold-removal','steam-cleaning','wall-stain-removal','sofa-cleaning','mattress-cleaning'],
    'Last-minute Cleaning': ['dishwashing','fridge-cleaning','window-cleaning'],
    'Business Cleaning': ['window-cleaning','carpet-cleaning','steam-cleaning','mold-removal','balcony-cleaning']
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

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', async () => {
    await loadServices();
    await loadCities();
    await initStripe();
    initDatePicker();
    initCookieBanner();
    
    document.getElementById('city-select')?.addEventListener('change', onCityChange);
    document.getElementById('date-input')?.addEventListener('change', onDateChange);
    document.getElementById('service-select')?.addEventListener('change', onServiceChange);
    document.getElementById('hours-select')?.addEventListener('change', updatePrice);
    document.getElementById('cleaners-select')?.addEventListener('change', updatePrice);
    
    document.getElementById('booking-form')?.addEventListener('submit', handleBookingSubmit);
    
    updateNextButton();
});

// --- API LOADING ---

async function loadServices() {
    try {
        const response = await fetch('/api/services');
        services = await response.json();
        const select = document.getElementById('service-select');
        const grid = document.getElementById('services-grid');
        if (!select || !grid) return;

        select.innerHTML = `<option value="" data-i18n="booking.selectService">Select a service</option>`;
        grid.innerHTML = '';

        services.forEach(service => {
            const name = service[`name_${currentLanguage}`] || service.name;
            const option = document.createElement('option');
            option.value = service.id;
            option.textContent = name;
            option.dataset.price = service.price_per_hour;
            select.appendChild(option);
            
            const icon = serviceIcons[service.name] || 'fa-sparkles';
            const card = document.createElement('div');
            card.className = 'service-card';
            card.dataset.id = service.id;
            card.innerHTML = `
                <div class="service-icon"><i class="fas ${icon}"></i></div>
                <h3>${name}</h3>
                <p>${service[`description_${currentLanguage}`] || service.description || ''}</p>
                <div class="service-price">€${parseFloat(service.price_per_hour).toFixed(2)} <span>/hour</span></div>
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
        if (!select) return;

        select.innerHTML = `<option value="" data-i18n="booking.selectCity">Select a city</option>`;
        cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city.id;
            option.textContent = city[`name_${currentLanguage}`] || city.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading cities:', error);
    }
}

// --- STRIPE INTEGRATION ---

async function initStripe() {
    try {
        const response = await fetch('/api/stripe/config');
        const { publishableKey } = await response.json();
        
        stripe = Stripe(publishableKey);
        const elements = stripe.elements();
        
        cardElement = elements.create('card', {
            style: {
                base: { fontSize: '16px', color: '#5F6368' },
                invalid: { color: '#EF4444' }
            }
        });
        cardElement.mount('#stripe-card-element');
    } catch (error) {
        console.warn('Stripe init failed, check if publishable key is set.');
    }
}

// --- CORE LOGIC ---

async function handleBookingSubmit(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submit-btn');
    if (!submitBtn) return;

    // Loading State
    submitBtn.disabled = true;
    const originalContent = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Processing...';
    
    try {
        const priceInfo = updatePrice();
        const totalAmount = priceInfo.total;
        let paymentIntentId = null;

        if (stripe && cardElement) {
            const paymentResponse = await fetch('/api/create-payment-intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: totalAmount }),
            });
            
            if (!paymentResponse.ok) throw new Error('Payment creation failed');
            
            const { clientSecret, paymentIntentId: piId } = await paymentResponse.json();
            
            const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
                payment_method: {
                    card: cardElement,
                    billing_details: {
                        name: document.getElementById('name-input')?.value,
                        email: document.getElementById('email-input')?.value,
                    }
                }
            });

            if (error) throw new Error(error.message);
            paymentIntentId = piId;
        } else {
            paymentIntentId = 'test_' + Date.now();
        }

        // Collect Data
        const bookingData = {
            serviceId: document.getElementById('service-select').value,
            cityId: document.getElementById('city-select').value,
            customerName: document.getElementById('name-input').value,
            customerEmail: document.getElementById('email-input').value,
            customerPhone: document.getElementById('phone-input').value,
            streetName: document.getElementById('street-name-input').value,
            houseNumber: document.getElementById('house-number-input').value,
            propertySize: document.getElementById('property-size-input').value,
            doorbellName: document.getElementById('doorbell-name-input')?.value || '',
            bookingDate: document.getElementById('date-input').value,
            bookingTime: document.getElementById('time-select').value,
            hours: document.getElementById('hours-select').value,
            cleaners: document.getElementById('cleaners-select').value,
            totalAmount: totalAmount,
            paymentIntentId: paymentIntentId,
            notes: document.getElementById('notes-input')?.value || '',
            additionalServices: ALL_ADDONS.filter(id => document.getElementById(id)?.checked),
            supplies: Object.keys(SUPPLY_PRICES).filter(id => document.getElementById(id)?.checked)
        };

        const response = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingData),
        });

        if (!response.ok) throw new Error('Could not save booking');

        document.getElementById('booking-form').style.display = 'none';
        document.getElementById('booking-success').style.display = 'block';

    } catch (error) {
        console.error('Submit Error:', error);
        alert(error.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalContent;
    }
}

function updatePrice() {
    const hours = parseInt(document.getElementById('hours-select')?.value) || 4;
    const cleaners = parseInt(document.getElementById('cleaners-select')?.value) || 1;
    const pricePerHour = selectedService ? parseFloat(selectedService.price_per_hour) : 25;

    let total = pricePerHour * hours * cleaners;
    Object.keys(SUPPLY_PRICES).forEach(id => {
        if (document.getElementById(id)?.checked) total += SUPPLY_PRICES[id];
    });

    const display = document.getElementById('total-price');
    if (display) display.textContent = `€${total.toFixed(2)}`;
    return { total };
}

// --- UTILS ---

function filterAddonsForService(service) {
    const allowed = service ? addonMapping[service.name] || [] : ALL_ADDONS;
    ALL_ADDONS.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = !allowed.includes(id);
            if (el.disabled) el.checked = false;
            el.parentElement.classList.toggle('disabled', el.disabled);
        }
    });
}

function selectServiceCard(id) {
    document.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.service-card[data-id="${id}"]`)?.classList.add('selected');
    const select = document.getElementById('service-select');
    if (select) {
        select.value = id;
        selectedService = services.find(s => s.id == id);
        filterAddonsForService(selectedService);
        updatePrice();
        updateNextButton();
    }
}

function onServiceChange() {
    selectServiceCard(document.getElementById('service-select').value);
}

async function onDateChange() {
    const cityId = document.getElementById('city-select').value;
    const date = document.getElementById('date-input').value;
    const timeSelect = document.getElementById('time-select');
    if (!cityId || !date || !timeSelect) return;

    try {
        const res = await fetch(`/api/available-slots?cityId=${cityId}&date=${date}`);
        const data = await res.json();
        timeSelect.innerHTML = data.slots?.map(s => `<option value="${s}">${s}</option>`).join('') || '<option>No slots</option>';
    } catch (e) { console.error(e); }
}

function updateNextButton() {
    const btn = document.querySelector('#step-1 .btn-primary');
    if (btn) {
        const s = document.getElementById('service-select')?.value;
        const c = document.getElementById('city-select')?.value;
        btn.disabled = !(s && c);
    }
}

// --- UI HELPERS ---
function nextStep(n) { 
    if (n === 4) updateSummary();
    document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${n}`).classList.add('active');
}
function prevStep(n) { nextStep(n); }
function onCityChange() { onDateChange(); }
function initDatePicker() {
    const inp = document.getElementById('date-input');
    if (inp) inp.min = new Date(Date.now() + 86400000).toISOString().split('T')[0];
}
function initCookieBanner() { if(!localStorage.getItem('cookieConsent')) document.getElementById('cookie-banner')?.classList.add('active'); }
function acceptCookies() { localStorage.setItem('cookieConsent', 'accepted'); document.getElementById('cookie-banner').classList.remove('active'); }