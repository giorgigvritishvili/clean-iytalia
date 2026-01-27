let bookings = [];
let cities = [];
let services = [];
let workers = [];

let bookingPollingInterval = null; // For real-time updates

function saveLocalData() {
  localStorage.setItem('cities', JSON.stringify(cities));
  localStorage.setItem('services', JSON.stringify(services));

}
function loadLocalData() {
  cities = JSON.parse(localStorage.getItem('cities') || '[]');
  services = JSON.parse(localStorage.getItem('services') || '[]');

}


// Admin language override: always use Italian translations for the admin UI
const ADMIN_LANG = 'it';
function getAdminTranslations() {
  return (typeof translations !== 'undefined' && translations[ADMIN_LANG] && translations[ADMIN_LANG].admin) ? translations[ADMIN_LANG].admin : {};
}
// Ensure admin page is marked as Italian
try { document.documentElement.lang = 'it'; } catch (e) {}

// Re-render dynamic admin content when translations change
window.onLanguageChange = function(lang) {
  try {
    renderServices();
    renderCities();
    renderWorkers();
    renderRecentBookings();
    renderAllBookings();
    // update modal button texts if modal present
    const submitBtn = document.getElementById('service-submit-btn');
    if (submitBtn) {
      const A = getAdminTranslations().actions || {};
      submitBtn.textContent = submitBtn.textContent.includes((A.updateService || 'Update Service')) ? (A.updateService || 'Update Service') : (A.addService || 'Add Service');
    }
  } catch (e) { console.error('onLanguageChange admin hook error', e); }
};

function showLoginForm() {
  document.getElementById('access-button').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
}

document.addEventListener('DOMContentLoaded', async () => {
  await checkSession();

  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Add event listeners for dropdown toggles
  document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdownId = toggle.dataset.dropdown;
      toggleDropdown(dropdownId);
    });
  });

  // Add event listeners for sidebar menu items
  document.querySelectorAll('.sidebar-menu li').forEach(item => {
    if (!item.classList.contains('dropdown-toggle')) {
      item.addEventListener('click', () => switchTab(item.dataset.tab));
    }
  });

  // Add event listeners for dropdown menu items
  document.querySelectorAll('.dropdown-menu li').forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });
});

async function checkSession() {
  const token = localStorage.getItem('adminToken');

  // ❗ თუ ტოკენი არ არის — აუცილებლად ლოგინი
  if (!token) {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
    return;
  }

  try {
    const response = await fetch('/api/admin/check-session', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Invalid session');

    const data = await response.json();

    if (data.authenticated) {
      showDashboard();
    } else {
      throw new Error('Not authenticated');
    }

  } catch (error) {
    console.error('Session check failed:', error);
    localStorage.removeItem('adminToken');

    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
  }
}


async function handleLogin(e) {
  e.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    if (response.ok && data.token) {
      localStorage.setItem('adminToken', data.token);
      showDashboard();
    } else {
      alert((getAdminTranslations().messages && getAdminTranslations().messages.invalidCredentials) || 'Invalid credentials');
    }
  } catch (error) {
    console.error('Login failed:', error);
    alert((getAdminTranslations().messages && getAdminTranslations().messages.loginFailedTry) || 'Login failed. Please try again.');
  }
}

async function logout() {
  const token = localStorage.getItem('adminToken');
  try {
    await fetch('/api/admin/logout', { 
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    localStorage.removeItem('adminToken');
    stopBookingPolling(); // Stop polling on logout
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
  } catch (error) {
    console.error('Logout failed:', error);
  }
}

function showDashboard() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('dashboard').style.display = 'flex';
  loadDashboardData();
  startBookingPolling(); // Start real-time updates
}

async function loadDashboardData() {
  await Promise.all([
    loadStats(),
    loadBookings(),
    loadCities(),
    loadServices(),
    loadContactInfo(),
    loadWorkers()
  ]);
}
async function loadContactInfo() {
  const token = localStorage.getItem('adminToken');
  try {
    const res = await fetch('/api/admin/contact', {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: "no-store"
    });

    if (!res.ok) return;

    const c = await res.json();

    document.getElementById('contact-email').value = c.email || '';
    document.getElementById('contact-phone').value = c.phone || '';
    document.getElementById('contact-whatsapp').value = c.whatsapp || '';

  } catch (e) {
    console.error('Failed to load contact info', e);
  }
}

async function loadStats() {
  const token = localStorage.getItem('adminToken');
  try {
    // 1️⃣ Load bookings (WITHOUT CACHE)
    const response = await fetch('/api/admin/bookings', {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: "no-store"   // 🔥 ძალიან მნიშვნელოვანია
    });

    if (!response.ok) {
      throw new Error('Failed to load bookings');
    }

    bookings = await response.json();

    // 2️⃣ Compute stats safely
    const totalBookings = bookings.length;
    const pendingBookings = bookings.filter(b => b.status === 'pending').length;
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed').length;

    // 🔥 Revenue = მხოლოდ CONFIRMED / PAID bookings
    const totalRevenue = bookings
      .filter(b => b.status === 'confirmed' || b.status === 'paid')
      .reduce((sum, b) => {
        const amount = parseFloat(b.total_amount);
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);

    // 3️⃣ Update UI
    document.getElementById('stat-total').textContent = totalBookings;
    document.getElementById('stat-pending').textContent = pendingBookings;
    document.getElementById('stat-confirmed').textContent = confirmedBookings;
    document.getElementById('stat-revenue').textContent = `€${totalRevenue.toFixed(2)}`;

  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}



async function loadBookings() {
  const token = localStorage.getItem('adminToken');
  try {
    const response = await fetch('/api/admin/bookings', {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: "no-store"   // 🔥 მნიშვნელოვანია
    });

    if (!response.ok) {
      throw new Error('Failed to fetch bookings');
    }

    bookings = await response.json();

    renderRecentBookings();
    renderAllBookings();
  } catch (error) {
    console.error('Failed to load bookings:', error);
  }
}

function renderRecentBookings() {
  const tbody = document.getElementById('recent-bookings');
  const recent = bookings.slice(0, 5);

  tbody.innerHTML = recent.map(booking => {
    const service = services.find(s => s.id === booking.service_id);
    const city = cities.find(c => c.id === booking.city_id);
    const serviceName = booking.service_name_it || booking.service_name || (service ? (service.name_it || service.name) : 'N/A');
    const cityName = booking.city_name_it || booking.city_name || (city ? (city.name_it || city.name) : 'N/A');
    
    return `
      <tr onclick="showBookingDetails(${booking.id})" style="cursor: pointer;">
        <td>#${booking.id}</td>
        <td>${booking.customer_name}</td>
        <td>${serviceName}</td>
        <td>${cityName}</td>
        <td>${formatDate(booking.booking_date)}</td>
        <td><span class="status-badge ${booking.status}">${booking.status}</span></td>
        <td>€${parseFloat(booking.total_amount).toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  if (recent.length === 0) {
    const msg = (getAdminTranslations().messages && getAdminTranslations().messages.noBookingsYet) || 'No bookings yet';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-light);">${msg}</td></tr>`;
  }
}

function renderAllBookings() {
  const tbody = document.getElementById('all-bookings');
  const statusFilter = document.getElementById('status-filter').value;

  let filtered = bookings;
  if (statusFilter) {
    filtered = bookings.filter(b => b.status === statusFilter);
  }

  tbody.innerHTML = filtered.map(booking => {
    const service = services.find(s => s.id === booking.service_id);
    const city = cities.find(c => c.id === booking.city_id);
    const serviceName = booking.service_name_it || booking.service_name || (service ? (service.name_it || service.name) : 'N/A');
    const cityName = booking.city_name_it || booking.city_name || (city ? (city.name_it || city.name) : 'N/A');

    return `
      <tr>
        <td>#${booking.id}</td>
        <td>${booking.customer_name}</td>
        <td>
          <div style="font-size: 0.85rem;">${booking.customer_email}</div>
          <div style="font-size: 0.8rem; color: var(--text-light);">${booking.customer_phone}</div>
        </td>
        <td>${serviceName}</td>
        <td>${cityName}</td>
        <td>
          <div>${formatDate(booking.booking_date)}</div>
          <div style="font-size: 0.85rem; color: var(--text-light);">${booking.booking_time}</div>
        </td>
        <td>${booking.hours}h x ${booking.cleaners}</td>
        <td>€${parseFloat(booking.total_amount).toFixed(2)}</td>
        <td><span class="status-badge ${booking.stripe_status}">${booking.stripe_status}</span></td>
        <td><span class="status-badge ${booking.status}">${booking.status}</span></td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-secondary" onclick="showBookingDetails(${booking.id})">
              <i class="fas fa-eye"></i>
            </button>
            ${booking.status === 'pending' ? `
              <button class="btn btn-sm btn-success" onclick="confirmBooking(${booking.id})">
                <i class="fas fa-check"></i>
              </button>
              <button class="btn btn-sm btn-danger" onclick="rejectBooking(${booking.id})">
                <i class="fas fa-times"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (filtered.length === 0) {
    const msg = (getAdminTranslations().messages && getAdminTranslations().messages.noBookingsFound) || 'No bookings found';
    tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-light);">${msg}</td></tr>`;
  }
}

function filterBookings() {
  renderAllBookings();
}

function showBookingDetails(id) {
  const booking = bookings.find(b => b.id === id);
  if (!booking) return;

  const details = document.getElementById('booking-details');
  const Ladmin = getAdminTranslations();
  const Ltable = Ladmin.table || {};
  const Lbooking = (translations[ADMIN_LANG] && translations[ADMIN_LANG].booking) || {};
  const Lcontact = (translations[ADMIN_LANG] && translations[ADMIN_LANG].contact) || {};

  const cleanPhone = booking.customer_phone
  ? booking.customer_phone.replace(/[^0-9+]/g, '').replace(/^00/, '+')
  : booking.customer_phone || '';

  // Find service and city names if not already included
  const service = services.find(s => s.id === booking.service_id);
  const city = cities.find(c => c.id === booking.city_id);
  const serviceName = booking.service_name_it || booking.service_name || (service ? (service.name_it || service.name) : 'Unknown Service');
  const cityName = booking.city_name_it || booking.city_name || (city ? (city.name_it || city.name) : 'Unknown City');

  details.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <label>${Ltable.id || 'Booking ID'}</label>
        <span>#${booking.id}</span>
      </div>
      <div class="detail-item">
        <label>${Ltable.status || 'Status'}</label>
        <span class="status-badge ${booking.status}">${booking.status}</span>
      </div>
      <div class="detail-item">
        <label>${Ltable.customer || 'Customer'}</label>
        <span>${booking.customer_name}</span>
      </div>
      <div class="detail-item">
        <label>${Lcontact.email || 'Email'}</label>
        <span>${booking.customer_email}</span>
      </div>
      <div class="detail-item">
        <label>${Lcontact.phone || 'Phone'}</label>
        <span>${booking.customer_phone}</span>
      </div>
      <div class="detail-item">
        <label>${Ltable.service || 'Service'}</label>
        <span>${serviceName}</span>
      </div>
      <div class="detail-item">
        <label>${Ltable.city || 'City'}</label>
        <span>${cityName}</span>
      </div>
      <div class="detail-item full-width">
        <label>Address</label>
        <span>${booking.street_name} ${booking.house_number}${booking.doorbell_name ? ', ' + booking.doorbell_name : ''}</span>
      </div>
      <div class="detail-item">
        <label>${Ltable.date || 'Date'}</label>
        <span>${formatDate(booking.booking_date)}</span>
      </div>
      <div class="detail-item">
        <label>${Lbooking.time || 'Time'}</label>
        <span>${booking.booking_time}</span>
      </div>
      <div class="detail-item">
        <label>${Ltable.duration || 'Duration'}</label>
        <span>${booking.hours} hours</span>
      </div>
      <div class="detail-item">
        <label>${Lbooking.cleaners || 'Cleaners'}</label>
        <span>${booking.cleaners}</span>
      </div>
      <div class="detail-item">
        <label>${Ltable.amount || 'Total Amount'}</label>
        <span style="font-size: 1.25rem; font-weight: 600; color: var(--primary);">
          €${parseFloat(booking.total_amount).toFixed(2)}
        </span>
      </div>
      <div class="detail-item">
        <label>${Ltable.payment || 'Payment Status'}</label>
        <span class="status-badge ${booking.stripe_status}">${booking.stripe_status}</span>
      </div>
      ${booking.payment_intent_id ? `
        <div class="detail-item full-width">
          <label>Payment Intent ID</label>
          <span style="font-size: 0.85rem; word-break: break-all;">
            ${booking.payment_intent_id}
          </span>
        </div>
      ` : ''}
      ${booking.notes ? `
        <div class="detail-item full-width">
          <label>${Lbooking.notes || 'Special Instructions'}</label>
          <span>${booking.notes}</span>
        </div>
      ` : ''}
    </div>
  `;

  const actions = document.getElementById('booking-actions');

  if (booking.status === 'pending') {
    const A = getAdminTranslations().actions || {};
    actions.innerHTML = `
      <button class="btn btn-danger" onclick="rejectBooking(${booking.id}); closeModal('booking-modal');">
        <i class="fas fa-times"></i> ${A.reject || 'Reject'}
      </button>
      <button class="btn btn-warning" onclick="manualPayBooking(${booking.id}); closeModal('booking-modal');">
        <i class="fas fa-money-bill-wave"></i> Manual Pay
      </button>
      <button class="btn btn-success" onclick="confirmBooking(${booking.id}); closeModal('booking-modal');">
        <i class="fas fa-check"></i> ${A.confirmAndCharge || 'Confirm & Charge'}
      </button>
    `;
  } else {
    // ✅ --- აქ შევცვალეთ ტელეფონი → cleanPhone ---
    actions.innerHTML = `
      <a href="mailto:${booking.customer_email}" class="btn btn-secondary">
        <i class="fas fa-envelope"></i> Email
      </a>
      <a href="tel:${cleanPhone}" class="btn btn-secondary">
        <i class="fas fa-phone"></i> Call
      </a>
      <a href="https://wa.me/${cleanPhone}" target="_blank" class="btn btn-success">
        <i class="fab fa-whatsapp"></i> WhatsApp
      </a>
    `;
  }

  document.getElementById('booking-modal').classList.add('active');
}


async function confirmBooking(id) {
  const token = localStorage.getItem('adminToken');
  if (!confirm((getAdminTranslations().messages && getAdminTranslations().messages.confirmChargeBooking) || 'Confirm this booking and charge the customer?')) return;

  try {
    const response = await fetch(`/api/admin/bookings/${id}/confirm`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      alert((getAdminTranslations().messages && getAdminTranslations().messages.confirmBookingSuccess) || 'Booking confirmed and payment captured.');
      loadDashboardData();
    } else {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to confirm booking');
    }
  } catch (error) {
    console.error('Error confirming booking:', error);
    alert('Failed to confirm booking: ' + error.message);
  }
}

async function rejectBooking(id) {
  const token = localStorage.getItem('adminToken');
  if (!confirm((getAdminTranslations().messages && getAdminTranslations().messages.confirmRejectBooking) || 'Reject this booking? The payment authorization will be released.')) return;

  try {
    const response = await fetch(`/api/admin/bookings/${id}/reject`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      alert((getAdminTranslations().messages && getAdminTranslations().messages.rejectBookingSuccess) || 'Booking rejected. Payment released.');
      loadDashboardData();
    } else {
      throw new Error((getAdminTranslations().messages && getAdminTranslations().messages.rejectBookingFailed) || 'Failed to reject booking');
    }
  } catch (error) {
    console.error('Error rejecting booking:', error);
    alert('Failed to reject booking. Please try again.');
  }
}

async function loadCities() {
  const token = localStorage.getItem('adminToken');
  try {
    const response = await fetch('/api/admin/cities', {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: "no-store"
    });

    if (!response.ok) throw new Error("Failed to load cities");

    cities = await response.json();
    renderCities();
  } catch (error) {
    console.error('Failed to load cities:', error);
  }
}


function renderCities() {
  const grid = document.getElementById('cities-grid');

  grid.innerHTML = cities.map(city => `
    <div class="admin-card">
      <h4>
        ${city.name_it || city.name}
        <label class="toggle-switch">
          <input type="checkbox" ${city.enabled ? 'checked' : ''} onchange="toggleCity(${city.id}, this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </h4>
      <div class="card-details">
        <p><i class="fas fa-clock"></i> ${city.working_hours_start} - ${city.working_hours_end}</p>
        <p><i class="fas fa-calendar"></i> Giorni lavorativi: ${formatWorkingDays(city.working_days)}</p>
      </div>
    </div>
  `).join('');
}

function formatWorkingDays(days) {
  const dayNames = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  return days.split(',').map(d => dayNames[parseInt(d)]).join(', ');
}

async function toggleCity(id, enabled) {
  const token = localStorage.getItem('adminToken');
  try {
    const city = cities.find(c => c.id === id);
    if (!city) throw new Error("City not found");

    const res = await fetch(`/api/admin/cities/${id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        enabled,
        working_days: city.working_days,
        working_hours_start: city.working_hours_start,
        working_hours_end: city.working_hours_end,
      }),
      cache: "no-store" // 🔥 ძალიან მნიშვნელოვანია
    });

    if (!res.ok) {
      throw new Error('Server update failed');
    }

    // ✅ ყოველთვის თავიდან ვტვირთავთ რეალურ მონაცემებს
    await loadCities();

  } catch (error) {
    console.error('Failed to update city:', error);
    alert('Failed to update city. Please try again.');
    await loadCities(); // შეცდომის შემთხვევაში დავაბრუნოთ სწორ მდგომარეობაზე
  }
}



function showAddCityModal() {
  document.getElementById('city-form').reset();
  document.getElementById('city-modal').classList.add('active');
}

async function addCity() {
  const token = localStorage.getItem('adminToken');
  const name = document.getElementById('city-name').value.trim();
  const nameIt = document.getElementById('city-name-it').value.trim();
  const nameKa = document.getElementById('city-name-ka').value.trim();
  const nameRu = document.getElementById('city-name-ru').value.trim();
  const start = document.getElementById('city-start').value;
  const end = document.getElementById('city-end').value;
  const checkedDays = Array.from(document.querySelectorAll('#city-form .checkbox-group input:checked'))
                            .map(cb => cb.value);

  if (!name) {
    alert('Please fill in the English name');
    return;
  }

  // Fill empty localized fields with English name as fallback
  const finalNameIt = nameIt || name;
  const finalNameKa = nameKa || name;
  const finalNameRu = nameRu || name;

  try {
    const response = await fetch('/api/admin/cities', {
      cache: "no-store",
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name,
        name_it: finalNameIt,
        name_ka: finalNameKa,
        name_ru: finalNameRu,
        working_days: checkedDays.join(','),
        working_hours_start: start,
        working_hours_end: end,
      }),
    });

    if (response.ok) {
      await loadCities(); // Reload from server to get updated data
      closeModal('city-modal');
    } else {
      throw new Error('Failed to add city');
    }
  } catch (error) {
    console.error('Failed to add city:', error);
    alert('Failed to add city. Please try again.');
  }
}

async function loadServices() {
  const token = localStorage.getItem('adminToken');
  try {
    const response = await fetch('/api/admin/services', {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: "no-store"         // 🔥 სწორია — დატოვე
    });

    if (!response.ok) {
      throw new Error('Failed to fetch services');
    }

    services = await response.json();
    renderServices();
  } catch (error) {
    console.error('Failed to load services:', error);
  }
}



function renderServices() {
  const grid = document.getElementById('services-grid');

  grid.innerHTML = services.map(service => {
    const localizedName = (service.name_it && service.name_it.trim()) || service.name || '';
    const localizedDesc = (service.description_it && service.description_it.trim()) || service.description || '';
    const actions = getAdminTranslations().actions || {};

    return `
    <div class="admin-card">
      <h4>
        ${localizedName}
        <div class="card-actions">
          <button class="btn btn-sm btn-secondary" onclick="showEditServiceModal(${service.id})" title="${actions.editService || 'Edit Service'}">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteService(${service.id})" title="${actions.deleteService || 'Delete'}">
            <i class="fas fa-trash"></i>
          </button>
          <label class="toggle-switch">
            <input type="checkbox" ${service.enabled ? 'checked' : ''} onchange="toggleService(${service.id}, this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </h4>
      <div class="card-details">
        <p><i class="fas fa-broom"></i> ${getAdminTranslations().menu && getAdminTranslations().menu.services ? getAdminTranslations().menu.services : 'Servizi'}</p>
        <p>${localizedDesc}</p>
      </div>
      <div class="card-price">€${parseFloat(service.price_per_hour).toFixed(2)} <span style="font-size: 0.9rem; font-weight: normal; color: var(--text-light);">/ora</span></div>
    </div>
  `;
  }).join('');
}

async function toggleService(id, enabled) {
  try {
    const service = services.find(s => s.id === id);
    if (!service) throw new Error("Service not found");

    const res = await fetch(`/api/admin/services/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      cache: "no-store",
      body: JSON.stringify({
        enabled,
        price_per_hour: service.price_per_hour,
      }),
    });

    if (!res.ok) throw new Error("Server update failed");

    // 🔥 სწორია — თავიდან ვტვირთავთ რეალურ მონაცემებს
    await loadServices();

  } catch (error) {
    console.error('Failed to update service:', error);
    alert('Failed to update service. Please try again.');
    await loadServices(); // შეცდომის შემთხვევაში დავაბრუნოთ სწორ მდგომარეობაზე
  }
}



function showAddServiceModal() {
  document.getElementById('service-modal-title').textContent = (getAdminTranslations().actions && getAdminTranslations().actions.addServiceTitle) || 'Add New Service';
  document.getElementById('service-form').reset();
  document.getElementById('service-submit-btn').textContent = (getAdminTranslations().actions && getAdminTranslations().actions.addService) || 'Add Service';
  document.getElementById('service-submit-btn').onclick = saveService;
  document.getElementById('service-modal').classList.add('active');
}

function showEditServiceModal(id) {
  const service = services.find(s => s.id === id);
  if (!service) return;

  document.getElementById('service-modal-title').textContent = (getAdminTranslations().actions && getAdminTranslations().actions.editService) || 'Edit Service';
  document.getElementById('service-name').value = service.name;
  document.getElementById('service-name-it').value = service.name_it;
  document.getElementById('service-name-ka').value = service.name_ka || '';
  document.getElementById('service-name-ru').value = service.name_ru || '';
  document.getElementById('service-description').value = service.description;
  document.getElementById('service-description-it').value = service.description_it;
  document.getElementById('service-description-ka').value = service.description_ka || '';
  document.getElementById('service-description-ru').value = service.description_ru || '';
  document.getElementById('service-price').value = service.price_per_hour;
  document.getElementById('service-enabled').value = service.enabled.toString();

  document.getElementById('service-submit-btn').textContent = (getAdminTranslations().actions && getAdminTranslations().actions.updateService) || 'Update Service';
  document.getElementById('service-submit-btn').onclick = () => saveService(id);
  document.getElementById('service-modal').classList.add('active');
}

async function saveService(id = null) {
  const name = document.getElementById('service-name').value.trim();
  const nameIt = document.getElementById('service-name-it').value.trim();
  const nameKa = document.getElementById('service-name-ka').value.trim();
  const nameRu = document.getElementById('service-name-ru').value.trim();
  const description = document.getElementById('service-description').value.trim();
  const descriptionIt = document.getElementById('service-description-it').value.trim();
  const descriptionKa = document.getElementById('service-description-ka').value.trim();
  const descriptionRu = document.getElementById('service-description-ru').value.trim();
  const price = parseFloat(document.getElementById('service-price').value);
  const enabled = document.getElementById('service-enabled').value === 'true';

  if (!name || !description || isNaN(price)) {
    alert('Please fill in the English name, description, and price');
    return;
  }

  // Fill empty localized fields with English as fallback
  const finalNameIt = nameIt || name;
  const finalNameKa = nameKa || name;
  const finalNameRu = nameRu || name;
  const finalDescriptionIt = descriptionIt || description;
  const finalDescriptionKa = descriptionKa || description;
  const finalDescriptionRu = descriptionRu || description;

  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/admin/services/${id}` : '/api/admin/services';
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name,
        name_it: finalNameIt,
        name_ka: finalNameKa,
        name_ru: finalNameRu,
        description,
        description_it: finalDescriptionIt,
        description_ka: finalDescriptionKa,
        description_ru: finalDescriptionRu,
        price_per_hour: price,
        enabled,
      }),
    });

    if (response.ok) {
      closeModal('service-modal');
      loadServices();
    } else {
      throw new Error('Failed to save service');
    }
  } catch (error) {
    console.error('Failed to save service:', error);
    alert('Failed to save service. Please try again.');
  }
}

async function deleteService(id) {
  if (!confirm('Sei sicuro di voler eliminare questo servizio? Questa azione è irreversibile.')) return;

  try {
 const response = await fetch(`/api/admin/services/${id}`, {
  method: 'DELETE',
  credentials: 'include',
  cache: "no-store"
});


    if (response.ok) {
      loadServices();
    } else {
      throw new Error('Failed to delete service');
    }
  } catch (error) {
    console.error('Failed to delete service:', error);
    alert((getAdminTranslations().messages && getAdminTranslations().messages.failedDeleteService) || 'Failed to delete service. Please try again.');
  }
}

function toggleDropdown(dropdownId) {
  const dropdown = document.getElementById(`${dropdownId}-dropdown`);
  const isOpen = dropdown.classList.contains('open');

  // Close all dropdowns
  document.querySelectorAll('.dropdown-menu').forEach(menu => {
    menu.classList.remove('open');
  });

  // Toggle the clicked dropdown
  if (!isOpen) {
    dropdown.classList.add('open');
  }
}

function switchTab(tab) {
  // Close all dropdowns
  document.querySelectorAll('.dropdown-menu').forEach(menu => {
    menu.classList.remove('open');
  });

  // Update active states for menu items
  document.querySelectorAll('.sidebar-menu li').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });

  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tab}-tab`);
  });

  const titles = {
    overview: 'Overview',
    bookings: 'All Bookings',
    cities: 'Cities',
    services: 'Services',
    'available-projects': 'Available Projects',
    'my-projects': 'My Projects',
    'appointment-calendar': 'Appointment Calendar',
    'my-appointments': 'My Appointments',
    earnings: 'Earnings',
    payout: 'Payout',
    'commission-invoices': 'Commission Invoices',
    'billing-commissions': 'Billing & Commissions',
    workers: 'Workers',
  };
  // Use translations if available
  const titleKeyMap = {
    overview: 'overview',
    bookings: 'bookings',
    cities: 'cities',
    services: 'services',
    'available-projects': 'availableProjects',
    'my-projects': 'myProjects',
    'appointment-calendar': 'appointmentCalendar',
    'my-appointments': 'myAppointments',
    earnings: 'earnings',
    payout: 'payout',
    'commission-invoices': 'commissionInvoices',
    'billing-commissions': 'billingCommissions',
    workers: 'workers'
  };

  let translatedTitle = null;
  try {
    const key = titleKeyMap[tab];
    if (key && translations && translations[ADMIN_LANG] && translations[ADMIN_LANG].admin && translations[ADMIN_LANG].admin.menu && translations[ADMIN_LANG].admin.menu[key]) {
      translatedTitle = translations[ADMIN_LANG].admin.menu[key];
    }
  } catch (e) {}

  document.getElementById('page-title').textContent = translatedTitle || (titles[tab] || 'Dashboard');

  // Load data for specific tabs
  switch(tab) {
    case 'available-projects':
      loadAvailableProjects();
      break;
    case 'my-projects':
      loadMyProjects();
      break;
    case 'appointment-calendar':
      loadAppointmentCalendar();
      break;
    case 'my-appointments':
      loadMyAppointments();
      break;
    case 'earnings':
      loadEarnings();
      break;
    case 'payout':
      loadPayoutRequests();
      break;
    case 'commission-invoices':
      loadCommissionInvoices();
      break;
    case 'billing-commissions':
      loadBillingCommissions();
      break;
    case 'workers':
      loadWorkers();
      break;
  }
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('active');
}

// Close sidebar when clicking on overlay
document.addEventListener('click', function(e) {
  const sidebar = document.querySelector('.sidebar');
  const toggleBtn = document.querySelector('.mobile-sidebar-toggle');

  // If sidebar is active and click is outside sidebar and not on toggle button
  if (sidebar.classList.contains('active') && 
      !sidebar.contains(e.target) && 
      !toggleBtn.contains(e.target)) {
    sidebar.classList.remove('active');
  }
});

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// Placeholder functions for new features
function loadAvailableProjects() {
  // TODO: Load available projects from API
  const grid = document.getElementById('available-projects-grid');
  grid.innerHTML = '<div class="admin-card"><p>I progetti disponibili verranno caricati qui...</p></div>';
}

function loadMyProjects() {
  // TODO: Load user's projects from API
  const grid = document.getElementById('my-projects-grid');
  grid.innerHTML = '<div class="admin-card"><p>I tuoi progetti verranno caricati qui...</p></div>';
}

// Contact info management



async function saveContactInfo() {
  try {
    const email = document.getElementById('contact-email')?.value || '';
    const phone = document.getElementById('contact-phone')?.value || '';
    const whatsapp = document.getElementById('contact-whatsapp')?.value || '';

    const res = await fetch('/api/admin/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      cache: "no-store",
      body: JSON.stringify({ email, phone, whatsapp }),
    });

    // 🔥 ძალიან მნიშვნელოვანია — 204 წარმატებაც უნდა მივიღოთ!
    if (res.ok) {
      alert('Contact info saved ✅');
      await loadContactInfo(); // თავიდან ვტვირთავთ სერვერიდან
      return;
    }

    const txt = await res.text();
    throw new Error(txt || 'Save failed');

  } catch (e) {
    console.error('Failed to save contact info', e);
    alert('Failed to save contact info ❌');
  }
}


function filterMyProjects() {

  loadMyProjects();
}

function loadAppointmentCalendar() {
  const calendar = document.getElementById('appointment-calendar');
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Get bookings for current month
  const monthBookings = bookings.filter(booking => {
    const bookingDate = new Date(booking.booking_date);
    return bookingDate.getMonth() === currentMonth && bookingDate.getFullYear() === currentYear;
  });

  // Group bookings by date
  const bookingsByDate = {};
  monthBookings.forEach(booking => {
    const dateKey = booking.booking_date;
    if (!bookingsByDate[dateKey]) {
      bookingsByDate[dateKey] = [];
    }
    bookingsByDate[dateKey].push(booking);
  });

  // Generate calendar HTML
  const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                     'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

  let calendarHTML = `
    <div class="calendar-header">
      <h3>${monthNames[currentMonth]} ${currentYear}</h3>
    </div>
    <div class="calendar-grid">
  `;

  // Get first day of month and total days
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Day headers
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  calendarHTML += '<div class="calendar-day-header">';
  dayNames.forEach(day => {
    calendarHTML += `<div class="day-name">${day}</div>`;
  });
  calendarHTML += '</div>';

  // Calendar days
  calendarHTML += '<div class="calendar-days">';

  // Empty cells for days before first day of month
  for (let i = 0; i < firstDay; i++) {
    calendarHTML += '<div class="calendar-day empty"></div>';
  }

  // Days of the month
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayBookings = bookingsByDate[dateStr] || [];
    const isToday = day === currentDate.getDate() && currentMonth === currentDate.getMonth() && currentYear === currentDate.getFullYear();

    calendarHTML += `
      <div class="calendar-day ${isToday ? 'today' : ''} ${dayBookings.length > 0 ? 'has-bookings' : ''}" onclick="showDayBookings('${dateStr}')">
        <div class="day-number">${day}</div>
        ${dayBookings.length > 0 ? `<div class="booking-count">${dayBookings.length}</div>` : ''}
      </div>
    `;
  }

  calendarHTML += '</div></div>';

  calendar.innerHTML = calendarHTML;
}

function showDayBookings(dateStr) {
  const dayBookings = bookings.filter(booking => booking.booking_date === dateStr);

  if (dayBookings.length === 0) {
    alert('Nessuna prenotazione per questa data');
    return;
  }

  // Sort bookings by time
  dayBookings.sort((a, b) => a.booking_time.localeCompare(b.booking_time));

  const bookingList = dayBookings.map(booking => {
    const service = services.find(s => s.id === booking.service_id);
    const city = cities.find(c => c.id === booking.city_id);
    const serviceName = booking.service_name_it || booking.service_name || (service ? (service.name_it || service.name) : 'N/A');
    const cityName = booking.city_name_it || booking.city_name || (city ? (city.name_it || city.name) : 'N/A');
    const paymentStatus = booking.stripe_status === 'succeeded' ? 'Pagato' : (booking.status === 'paid' ? 'Pagato (Manuale)' : 'In attesa');
    const paymentColor = (booking.stripe_status === 'succeeded' || booking.status === 'paid') ? '#2ecc71' : '#f39c12';

    return `
      <div class="day-booking-item" style="border-left: 4px solid var(--primary); padding: 12px; margin-bottom: 12px; background: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div class="booking-time" style="font-weight: bold; color: var(--primary); font-size: 1.1rem;">
            <i class="fas fa-clock"></i> ${booking.booking_time}
          </div>
          <div style="font-size: 0.85rem; padding: 4px 8px; border-radius: 4px; background: ${paymentColor}22; color: ${paymentColor}; font-weight: 600;">
            <i class="fas fa-credit-card"></i> ${paymentStatus}
          </div>
        </div>
        <div class="booking-details">
          <div style="display: flex; gap: 10px; margin-bottom: 5px;">
             <span style="font-weight: 600; color: var(--text-dark);">${booking.customer_name}</span>
             <span style="color: #888; font-size: 0.9rem;">#${booking.id}</span>
          </div>
          <div style="font-size: 0.9rem; color: #444; margin-bottom: 3px;">
            <strong>${serviceName}</strong> @ ${cityName}
          </div>
          <div class="booking-address" style="font-size: 0.85rem; color: #666; margin-top: 3px;">
            <i class="fas fa-map-marker-alt"></i> ${booking.street_name} ${booking.house_number}
          </div>
          <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
            <span class="status-badge ${booking.status}">${booking.status}</span>
            <button class="btn btn-sm btn-secondary" onclick="this.closest('.modal').remove(); showBookingDetails(${booking.id})">
              <i class="fas fa-eye"></i> Dettagli
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content calendar-modal" style="max-width: 500px; border-radius: 12px;">
      <div class="modal-header" style="border-bottom: 1px solid #eee; padding: 15px 20px;">
        <h3 style="margin: 0;">Prenotazioni per ${formatDate(dateStr)}</h3>
        <button class="close-btn" onclick="this.closest('.modal').remove()">×</button>
      </div>
      <div class="modal-body" style="max-height: 75vh; overflow-y: auto; padding: 20px; background: #f8f9fa;">
        ${bookingList}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function changeCalendarView() {

  loadAppointmentCalendar();
}

function loadMyAppointments() {

  const table = document.getElementById('my-appointments-table');
  table.innerHTML = '<tr><td colspan="7" style="text-align: center;">I tuoi appuntamenti verranno caricati qui...</td></tr>';
}

function filterMyAppointments() {

  loadMyAppointments();
}

function loadEarnings() {

  document.getElementById('total-earnings').textContent = '€0';
  document.getElementById('monthly-earnings').textContent = '€0';
  document.getElementById('pending-earnings').textContent = '€0';
  document.getElementById('commission-rate').textContent = '0%';


  const history = document.getElementById('earnings-history');
  history.innerHTML = '<tr><td colspan="5" style="text-align: center;">La cronologia delle entrate verrà caricata qui...</td></tr>';
}

function loadPayoutRequests() {

  const requests = document.getElementById('payout-requests');
  requests.innerHTML = '<tr><td colspan="6" style="text-align: center;">Le richieste di pagamento verranno caricate qui...</td></tr>';
}

function requestPayout() {

  alert((getAdminTranslations().messages && getAdminTranslations().messages.payoutPlaceholder) || 'La funzionalità di richiesta pagamento sarà implementata qui.');
}

function loadCommissionInvoices() {

  const invoices = document.getElementById('commission-invoices');
  invoices.innerHTML = '<tr><td colspan="6" style="text-align: center;">Commission invoices will be loaded here...</td></tr>';
}

function filterCommissionInvoices() {
  // TODO: Filter invoices by status
  loadCommissionInvoices();
}

function loadBillingCommissions() {
  // TODO: Load billing and commissions data
  // Update stats
  document.getElementById('total-invoices').textContent = '0';
  document.getElementById('paid-invoices').textContent = '0';
  document.getElementById('pending-invoices').textContent = '0';
  document.getElementById('overdue-invoices').textContent = '0';

  // Update commission activity
  const activity = document.getElementById('commission-activity');
  activity.innerHTML = '<tr><td colspan="5" style="text-align: center;">Commission activity will be loaded here...</td></tr>';
}

function generateCommissionReport() {
  // TODO: Generate commission report
  alert((getAdminTranslations().messages && getAdminTranslations().messages.commissionReportPlaceholder) || 'La generazione del rapporto delle commissioni sarà implementata qui.');
}

function loadWorkers() {
  workers = JSON.parse(localStorage.getItem('workers') || '[]');
  renderWorkers();
}



function renderWorkers() {
  const container = document.getElementById('workers-grid');
  container.innerHTML = ''; // Clear previous

  if (workers.length === 0) {
    container.innerHTML = '<p>No workers added yet.</p>';
    return;
  }

  workers.forEach((worker, index) => {
    const card = document.createElement('div');
    card.className = 'worker-card';
    card.innerHTML = `
      <h4>${worker.name}</h4>
      <p>Email: ${worker.email}</p>
      <p>Phone: ${worker.phone}</p>
      <p>Rating: ${worker.rating}</p>
      <p>Jobs Completed: ${worker.jobs}</p>
      <p>Status: ${worker.active ? 'Active' : 'Inactive'}</p>
      <p>Specialties: ${worker.specialties.join(', ')}</p>
      <button class="btn btn-sm btn-danger" onclick="deleteWorker(${index})">Delete</button>
    `;
    container.appendChild(card);
  });
}

function showAddProjectModal() {
  // TODO: Show add project modal
  alert((getAdminTranslations().messages && getAdminTranslations().messages.addProjectPlaceholder) || 'La finestra per aggiungere un progetto sarà implementata qui.');
}

function showAddWorkerModal() {
  document.getElementById('worker-modal').style.display = 'block';
}

function showEditWorkerModal(id) {
  const worker = workers.find(w => w.id === id);
  if (!worker) return;

  document.getElementById('worker-modal-title').textContent = 'Edit Worker';
  document.getElementById('worker-name').value = worker.name;
  document.getElementById('worker-email').value = worker.email;
  document.getElementById('worker-phone').value = worker.phone;
  document.getElementById('worker-rating').value = worker.rating;
  document.getElementById('worker-jobs').value = worker.completed_jobs;
  document.getElementById('worker-active').value = worker.active.toString();

  // Populate specialties
  const container = document.getElementById('specialties-container');
  container.innerHTML = '';
  worker.specialties.forEach(specialty => {
    addSpecialty(specialty);
  });

  document.getElementById('worker-submit-btn').textContent = 'Update Worker';
  document.getElementById('worker-submit-btn').onclick = () => saveWorker(id);
  document.getElementById('worker-modal').classList.add('active');
}

// სპეციალობების გამოსაღება ფორმიდან
function getSpecialties() {
  const inputs = document.querySelectorAll('.specialty-input');
  return Array.from(inputs)
    .map(input => input.value.trim())
    .filter(val => val.length > 0);
}

function saveWorker() {
  const name = document.getElementById('worker-name').value.trim();
  const email = document.getElementById('worker-email').value.trim();
  const phone = document.getElementById('worker-phone').value.trim();
  const rating = parseFloat(document.getElementById('worker-rating').value);
  const jobs = parseInt(document.getElementById('worker-jobs').value);
  const active = document.getElementById('worker-active').value === 'true';

  // Specialties
  const specialtiesInputs = document.querySelectorAll('#specialties-container .specialty-input');
  const specialties = [];
  specialtiesInputs.forEach(input => {
    const val = input.value.trim();
    if (val) specialties.push(val);
  });

  if (!name || !email || !phone) {
    alert('Please fill in all required fields');
    return;
  }

  const newWorker = { name, email, phone, rating, jobs, active, specialties };

  workers.push(newWorker);
  localStorage.setItem('workers', JSON.stringify(workers));

  closeModal('worker-modal');
  renderWorkers();

  // Clear form
  document.getElementById('worker-form').reset();
  document.getElementById('specialties-container').innerHTML = `
    <div class="specialty-item">
      <input type="text" class="specialty-input" placeholder="e.g., Regular Cleaning">
      <button type="button" class="btn btn-sm btn-danger" onclick="removeSpecialty(this)">×</button>
    </div>
  `;
}
// სპეციალობის დამატება
function addSpecialty() {
  const container = document.getElementById('specialties-container');
  const div = document.createElement('div');
  div.className = 'specialty-item';
  div.innerHTML = `
    <input type="text" class="specialty-input" placeholder="e.g., Regular Cleaning">
    <button type="button" class="btn btn-sm btn-danger" onclick="removeSpecialty(this)">×</button>
  `;
  container.appendChild(div);
}

// სპეციალობის წაშლა
function removeSpecialty(button) {
  button.parentElement.remove();
}


function startBookingPolling() {
  if (bookingPollingInterval) return;
  bookingPollingInterval = setInterval(async () => {
    await loadBookings();
    await loadStats();
  }, 30000); // Poll every 30 seconds
}

function stopBookingPolling() {
  if (bookingPollingInterval) {
    clearInterval(bookingPollingInterval);
    bookingPollingInterval = null;
  }
}

async function manualPayBooking(id) {
  const token = localStorage.getItem('adminToken');
  if (!confirm('Mark this booking as manually paid?')) return;

  try {
    const response = await fetch(`/api/admin/bookings/${id}/pay`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      alert('Booking marked as paid.');
      loadDashboardData();
    } else {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update booking');
    }
  } catch (error) {
    console.error('Error updating booking:', error);
    alert('Failed to update booking: ' + error.message);
  }
}

function deleteWorker(index) {
  if (!confirm('Are you sure you want to delete this worker?')) return;
  workers.splice(index, 1);
  localStorage.setItem('workers', JSON.stringify(workers));
  renderWorkers();
}

async function toggleWorker(id, active) {
  try {
    const worker = workers.find(w => w.id === id);
    if (!worker) throw new Error("Worker not found");

    const res = await fetch(`/api/admin/workers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      cache: "no-store",
      body: JSON.stringify({
        active,
        name: worker.name,
        email: worker.email,
        phone: worker.phone,
        specialties: worker.specialties,
        rating: worker.rating,
        completed_jobs: worker.completed_jobs,
      }),
    });

    if (!res.ok) throw new Error("Server update failed");

    await loadWorkers();

  } catch (error) {
    console.error('Failed to update worker:', error);
    alert('Failed to update worker. Please try again.');
    await loadWorkers();
  }
}
window.onload = () => {
  loadWorkers();
};