let bookings = [];
let cities = [];
let services = [];
let workers = [];

let bookingPollingInterval = null; // For real-time updates
let adminEventSource = null;

function saveLocalData() {
  localStorage.setItem('cities', JSON.stringify(cities));
  localStorage.setItem('services', JSON.stringify(services));

}
function loadLocalData() {
  cities = JSON.parse(localStorage.getItem('cities') || '[]');
  services = JSON.parse(localStorage.getItem('services') || '[]');

}


// Admin language override: use current language for the admin UI
let ADMIN_LANG = 'it';
function getAdminTranslations() {
  return (typeof translations !== 'undefined' && translations[ADMIN_LANG] && translations[ADMIN_LANG].admin) ? translations[ADMIN_LANG].admin : {};
}
// Ensure admin page is marked as Italian
try { document.documentElement.lang = 'it'; } catch (e) {}

// Re-render dynamic admin content when translations change
window.onLanguageChange = function(lang) {
  try {
    // Keep admin UI language locked to Italian; ignore external language changes
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
  const token = localStorage.getItem('adminToken');

  // Hide dashboard by default until authenticated
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('login-page').style.display = 'flex';

  if (token) {
    await checkSession();
  }

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
      credentials: 'include',
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
    stopAdminSSE(); // Stop SSE on logout
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
  startBookingPolling(); // Start polling as fallback
  startAdminSSE(); // Start SSE for push updates
}

async function loadDashboardData() {
  const token = localStorage.getItem('adminToken');
  if (token) {
    // push any locally-created workers to server before loading lists
    await syncPendingWorkers();
  }

  await Promise.all([
    loadStats(),
    loadBookings(),
    loadCities(),
    loadServices(),
    loadContactInfo(),
    loadWorkers()
  ]);
}

function getPendingWorkers() {
  return JSON.parse(localStorage.getItem('pendingWorkers') || '[]');
}

function setPendingWorkers(list) {
  localStorage.setItem('pendingWorkers', JSON.stringify(list));
}

async function syncPendingWorkers() {
  const token = localStorage.getItem('adminToken');
  if (!token) return;
  const pending = getPendingWorkers();
  if (!pending || pending.length === 0) return;

  // Attempt to create each pending worker on server
  for (const p of pending.slice()) {
    try {
      const res = await fetch('/api/admin/workers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: p.name,
          email: p.email,
          phone: p.phone,
          specialties: p.specialties || [],
          rating: p.rating || 0,
          completed_jobs: p.completed_jobs || 0,
          active: p.active !== undefined ? p.active : true
        })
      });

      if (res.ok) {
        // remove from pending
        const list = getPendingWorkers();
        const idx = list.findIndex(x => x._tempId === p._tempId);
        if (idx !== -1) {
          list.splice(idx, 1);
          setPendingWorkers(list);
        }
      } else {
        console.warn('Failed to sync pending worker:', await res.text());
      }
    } catch (err) {
      console.error('Error syncing pending worker:', err);
      // stop trying further on network errors
      return;
    }
  }
  // refresh workers list from server after sync
  await loadWorkers();
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
      cache: "no-store"
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        logout();
        return;
      }
      throw new Error('Failed to fetch bookings');
    }

    const newBookings = await response.json();

    // Sort by date and time (descending) to keep newest at top
    newBookings.sort((a, b) => {
      const dateA = new Date(`${a.booking_date}T${a.booking_time}`);
      const dateB = new Date(`${b.booking_date}T${b.booking_time}`);
      return dateB - dateA;
    });

    bookings = newBookings;

    renderRecentBookings();
    renderAllBookings();
    if (document.getElementById('appointment-calendar-tab')?.classList.contains('active')) {
      loadAppointmentCalendar();
    }
  } catch (error) {
    console.error('Failed to load bookings:', error);
  }
}

function renderRecentBookings() {
  const tbody = document.getElementById('recent-bookings');
  if (!tbody) return;
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
  if (!tbody) return;
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
            <button class="btn btn-sm btn-danger" onclick="deleteBooking(${booking.id})">
              <i class="fas fa-trash"></i>
            </button>
            ${booking.status === 'pending' ? `
              <button class="btn btn-sm btn-success" onclick="confirmBooking(${booking.id})">
                <i class="fas fa-check"></i>
              </button>
              <button class="btn btn-sm btn-warning" onclick="rejectBooking(${booking.id})">
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
  closeModal('booking-modal');

  const booking = bookings.find(b => b.id === Number(id));
  if (!booking) {
    console.error('Booking not found for ID:', id);
    return;
  }

  const details = document.getElementById('booking-details');
  const actions = document.getElementById('booking-actions');

  const Ladmin = getAdminTranslations();
  const Ltable = Ladmin.table || {};
  const Lbooking = (translations[ADMIN_LANG]?.booking) || {};
  const Lcontact = (translations[ADMIN_LANG]?.contact) || {};

  const cleanPhone = booking.customer_phone
    ? booking.customer_phone.replace(/[^0-9+]/g, '').replace(/^00/, '+')
    : '';

  const service = services.find(s => Number(s.id) === Number(booking.service_id));
  const city = cities.find(c => Number(c.id) === Number(booking.city_id));

  const serviceName =
    booking.service_name_it ||
    booking.service_name ||
    (service ? service.name_it || service.name : 'N/A');

  const cityName =
    booking.city_name_it ||
    booking.city_name ||
    (city ? city.name_it || city.name : 'N/A');

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
        <span>
          ${booking.street_name} ${booking.house_number}
          ${booking.doorbell_name ? ', ' + booking.doorbell_name : ''}
        </span>
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
        <span style="font-size:1.25rem;font-weight:600;color:var(--primary)">
          €${Number(booking.total_amount).toFixed(2)}
        </span>
      </div>

      <div class="detail-item">
        <label>${Ltable.payment || 'Payment Status'}</label>
        <span class="status-badge ${booking.stripe_status}">
          ${booking.stripe_status}
        </span>
      </div>

      ${booking.payment_intent_id ? `
        <div class="detail-item full-width">
          <label>Payment Intent ID</label>
          <span style="font-size:0.85rem;word-break:break-all">
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

  if (booking.status === 'pending') {
    const A = getAdminTranslations().actions || {};
    actions.innerHTML = `
      <button class="btn btn-danger" onclick="rejectBooking(${booking.id})">
        Reject
      </button>
      <button class="btn btn-warning" onclick="manualPayBooking(${booking.id})">
        Manual Pay
      </button>
      <button class="btn btn-success" onclick="confirmBooking(${booking.id})">
        Confirm & Charge
      </button>
      <button class="btn btn-secondary" onclick="closeModal('booking-modal')">
        Close
      </button>
    `;
  } else {
    actions.innerHTML = `
      <a href="mailto:${booking.customer_email}" class="btn btn-secondary">
        Email
      </a>
      <a href="tel:${cleanPhone}" class="btn btn-secondary">
        Call
      </a>
      <a href="https://wa.me/${cleanPhone}" target="_blank" class="btn btn-success">
        WhatsApp
      </a>
      <button class="btn btn-secondary" onclick="closeModal('booking-modal')">
        Close
      </button>
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
  if (!grid) return;

  grid.innerHTML = cities.map(city => `
    <div class="admin-card">
      <h4>
        ${city.name_it || city.name}
        <div class="card-actions">
          <button class="btn btn-sm btn-danger" onclick="deleteCity(${city.id})" title="Delete City">
            <i class="fas fa-trash"></i>
          </button>
          <label class="toggle-switch">
            <input type="checkbox" ${city.enabled ? 'checked' : ''} onchange="toggleCity(${city.id}, this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
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

async function deleteCity(id) {
  const token = localStorage.getItem('adminToken');
  if (!confirm('Sei sicuro di voler eliminare questa città? Questa azione è irreversibile.')) return;

  try {
    const res = await fetch(`/api/admin/cities/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error('Failed to delete city');
    }

    // Remove from local array and re-render
    cities = cities.filter(c => c.id !== id);
    renderCities();

  } catch (error) {
    console.error('Failed to delete city:', error);
    alert('Failed to delete city. Please try again.');
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
  if (!grid) return;

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
  const token = localStorage.getItem('adminToken');
  try {
    const service = services.find(s => s.id === id);
    if (!service) throw new Error("Service not found");

    const res = await fetch(`/api/admin/services/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
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
  const token = localStorage.getItem('adminToken');
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      cache: "no-store",
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
  const token = localStorage.getItem('adminToken');
  if (!confirm('Sei sicuro di voler eliminare questo servizio? Questa azione è irreversibile.')) return;

  try {
    const response = await fetch(`/api/admin/services/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
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
  const modal = document.getElementById(id);
  if (!modal) return;

  modal.classList.remove('active');

  // Reset form if it's the worker modal
  if (id === 'worker-modal') {
    document.getElementById('worker-form').reset();
    document.getElementById('worker-modal-title').textContent = 'Add New Worker';
    document.getElementById('worker-submit-btn').textContent = 'Add Worker';
    document.getElementById('worker-submit-btn').onclick = saveWorker;
  }
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

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

function loadAppointmentCalendar() {
  const calendar = document.getElementById('appointment-calendar');
  if (!calendar) return;

  const monthNames = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
  ];

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const startingDay = firstDay === 0 ? 6 : firstDay - 1;

  let calendarHTML = `
    <div class="calendar-header">
      <button class="btn btn-sm btn-secondary" onclick="changeMonth(-1)">
        <i class="fas fa-chevron-left"></i>
      </button>
      <h3>${monthNames[currentMonth]} ${currentYear}</h3>
      <button class="btn btn-sm btn-secondary" onclick="changeMonth(1)">
        <i class="fas fa-chevron-right"></i>
      </button>
      <input type="date" id="calendar-date-picker" onchange="jumpToDate(this.value)" style="margin-left: 10px;">
    </div>
    <div class="calendar-grid">
      <div class="calendar-day-header">
        <div>Lun</div><div>Mar</div><div>Mer</div><div>Gio</div><div>Ven</div><div>Sab</div><div>Dom</div>
      </div>
      <div class="calendar-days">
  `;

  for (let i = 0; i < startingDay; i++) {
    calendarHTML += '<div class="calendar-day empty"></div>';
  }

  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayBookings = bookings.filter(b => b.booking_date === dateStr);
    const isToday = today.getDate() === day && today.getMonth() === currentMonth && today.getFullYear() === currentYear;

    calendarHTML += `
      <div class="calendar-day ${isToday ? 'today' : ''} ${dayBookings.length > 0 ? 'has-bookings' : ''}" onclick="showDayBookings('${dateStr}')">
        <span class="day-number">${day}</span>
        ${dayBookings.length > 0 ? `<div class="booking-count">${dayBookings.length}</div>` : ''}
      </div>
    `;
  }

  calendarHTML += '</div></div>';
  calendar.innerHTML = calendarHTML;
}

function jumpToDate(dateStr) {
  if (!dateStr) return;
  const date = new Date(dateStr);
  currentYear = date.getFullYear();
  currentMonth = date.getMonth();
  loadAppointmentCalendar();
}

function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  } else if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  loadAppointmentCalendar();
}

function showDayBookings(dateStr) {
  // Clear any existing modals first to prevent ID/DOM duplication issues
  const existingModals = document.querySelectorAll('.modal.calendar-day-modal');
  existingModals.forEach(m => m.remove());

  const dayBookings = bookings.filter(booking => booking.booking_date === dateStr);

  if (dayBookings.length === 0) {
    alert('Nessuna prenotazione per questa data');
    return;
  }

  // Sort bookings by time
  dayBookings.sort((a, b) => a.booking_time.localeCompare(b.booking_time));

  const bookingList = dayBookings.map(booking => {
    const service = services.find(s => Number(s.id) === Number(booking.service_id));
    const city = cities.find(c => Number(c.id) === Number(booking.city_id));
    const serviceName = booking.service_name_it || booking.service_name || (service ? (service.name_it || service.name) : 'N/A');
    const cityName = booking.city_name_it || booking.city_name || (city ? (city.name_it || city.name) : 'N/A');

    // Determine payment status and date
    let paymentInfo = '';
    if (booking.stripe_status === 'succeeded' || booking.status === 'paid') {
      const payDate = booking.updated_at ? formatDate(booking.updated_at) : formatDate(booking.booking_date);
      paymentInfo = `<div style="font-size: 0.8rem; color: #27ae60; margin-top: 4px;">
        <i class="fas fa-check-circle"></i> Pagato il: ${payDate}
      </div>`;
    } else {
      paymentInfo = `<div style="font-size: 0.8rem; color: #e67e22; margin-top: 4px;">
        <i class="fas fa-clock"></i> In attesa di pagamento
      </div>`;
    }

    return `
      <div class="day-booking-item" style="border-left: 4px solid var(--primary); padding: 12px; margin-bottom: 12px; background: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div class="booking-time" style="font-weight: bold; color: var(--primary); font-size: 1.1rem;">
            <i class="fas fa-clock"></i> ${booking.booking_time}
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <div class="status-badge ${booking.status}" style="font-size: 0.75rem;">${booking.status}</div>
            <button class="btn btn-sm btn-danger" onclick="deleteBooking(${booking.id}); this.closest('.modal').remove();" title="Elimina">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="booking-details">
          <div style="font-weight: 600; font-size: 1rem; margin-bottom: 4px;">${booking.customer_name}</div>
          <div style="font-size: 0.9rem; color: #444;">
            <strong>${serviceName}</strong> @ ${cityName}
          </div>
          ${paymentInfo}
          <div style="margin-top: 10px; text-align: right;">
            <button class="btn btn-sm btn-secondary" onclick="this.closest('.modal').remove(); showBookingDetails(${booking.id})">
              <i class="fas fa-eye"></i> Dettagli
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const modal = document.createElement('div');
  modal.className = 'modal active calendar-day-modal';
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
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
  // Load total earnings from localStorage, default to 0 if not set
  let totalEarnings = parseFloat(localStorage.getItem('totalEarnings') || '0');

  // If no earnings stored yet, calculate based on current bookings
  if (totalEarnings === 0 && bookings.length > 0) {
    totalEarnings = bookings.length * 19;
    localStorage.setItem('totalEarnings', totalEarnings.toString());
  }

  // Update UI
  document.getElementById('total-earnings').textContent = `€${totalEarnings.toFixed(2)}`;
  document.getElementById('monthly-earnings').textContent = '€0'; // Not implemented
  document.getElementById('pending-earnings').textContent = '€0'; // Not implemented
  document.getElementById('commission-rate').textContent = '0%'; // Not implemented

  const history = document.getElementById('earnings-history');
  history.innerHTML = '<tr><td colspan="5" style="text-align: center;">La cronologia delle entrate verrà caricata qui...</td></tr>';
}

function exportToExcel() {
  // Create CSV data from earnings history
  const csvData = [
    ['Date', 'Project', 'Amount', 'Commission', 'Status'], // Header
    // Since we don't have actual earnings history data, we'll create sample data
    ['2024-01-01', 'Cleaning Service', '€19.00', '€0.00', 'Completed'],
    ['2024-01-02', 'Deep Cleaning', '€19.00', '€0.00', 'Completed'],
    ['2024-01-03', 'Regular Cleaning', '€19.00', '€0.00', 'Completed']
  ];

  // Convert to CSV string
  const csvContent = csvData.map(row => row.join(',')).join('\n');

  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', 'earnings_history.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportToPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Add title
  doc.setFontSize(20);
  doc.text('Earnings History Report', 20, 20);

  // Add date
  doc.setFontSize(12);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 35);

  // Add table headers
  doc.setFontSize(14);
  doc.text('Date', 20, 50);
  doc.text('Project', 60, 50);
  doc.text('Amount', 120, 50);
  doc.text('Commission', 150, 50);
  doc.text('Status', 180, 50);

  // Add sample data (since we don't have real earnings history)
  const sampleData = [
    ['2024-01-01', 'Cleaning Service', '€19.00', '€0.00', 'Completed'],
    ['2024-01-02', 'Deep Cleaning', '€19.00', '€0.00', 'Completed'],
    ['2024-01-03', 'Regular Cleaning', '€19.00', '€0.00', 'Completed']
  ];

  let yPosition = 60;
  doc.setFontSize(10);
  sampleData.forEach(row => {
    doc.text(row[0], 20, yPosition);
    doc.text(row[1], 60, yPosition);
    doc.text(row[2], 120, yPosition);
    doc.text(row[3], 150, yPosition);
    doc.text(row[4], 180, yPosition);
    yPosition += 10;
  });

  // Add total
  const totalEarnings = parseFloat(localStorage.getItem('totalEarnings') || '0');
  doc.setFontSize(12);
  doc.text(`Total Earnings: €${totalEarnings.toFixed(2)}`, 20, yPosition + 10);

  // Download the PDF
  doc.save('earnings_history.pdf');
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

async function loadWorkers() {
  const token = localStorage.getItem('adminToken');
  try {
    const response = await fetch('/api/admin/workers', {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: "no-store"
    });
    if (!response.ok) throw new Error('Failed to fetch workers');
    workers = await response.json();
    renderWorkers();
  } catch (error) {
    console.error('Failed to load workers:', error);
    // Fallback if API not ready
    workers = JSON.parse(localStorage.getItem('workers') || '[]');
    renderWorkers();
  }
}

async function addWorker() {
  const token = localStorage.getItem('adminToken');
  const name = document.getElementById('worker-name').value;
  const email = document.getElementById('worker-email').value;
  const phone = document.getElementById('worker-phone').value;

  const workerData = { name, email, phone, rating: 5.0, completed_jobs: 0, active: true };

  try {
    const response = await fetch('/api/admin/workers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(workerData)
    });

    if (response.ok) {
      alert('Worker added successfully');
      closeModal('worker-modal');
      await loadWorkers();
    } else {
      const err = await response.json();
      throw new Error(err.error || 'Failed to add worker to server');
    }
  } catch (error) {
    console.error('Worker API error:', error);
    alert('Error adding worker: ' + error.message);
  }
}



function renderWorkers() {
  const container = document.getElementById('workers-grid');
  if (!container) return;
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
      <p>Jobs Completed: ${worker.jobs || 0}</p>
      <p>Status: ${worker.active ? 'Active' : 'Inactive'}</p>
      <div class="action-btns" style="margin-top: 10px;">
        <button class="btn btn-sm btn-danger" onclick="deleteWorker(${worker.id})">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function showAddProjectModal() {
  // TODO: Show add project modal
  alert((getAdminTranslations().messages && getAdminTranslations().messages.addProjectPlaceholder) || 'La finestra per aggiungere un progetto sarà implementata qui.');
}

function showAddWorkerModal() {
  const modal = document.getElementById('worker-modal');
  modal.classList.add('active');
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

async function saveWorker(id) {
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

  const payload = {
    name,
    email,
    phone,
    specialties,
    rating: isNaN(rating) ? 0 : rating,
    completed_jobs: isNaN(jobs) ? 0 : jobs,
    active: !!active
  };

  const token = localStorage.getItem('adminToken');

  // Try to persist to server if admin token available
  if (token) {
    try {
      const url = id ? `/api/admin/workers/${id}` : '/api/admin/workers';
      const method = id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save worker on server');
      }

      closeModal('worker-modal');
      await loadWorkers();
      // Clear form
      document.getElementById('worker-form').reset();
      document.getElementById('specialties-container').innerHTML = `
        <div class="specialty-item">
          <input type="text" class="specialty-input" placeholder="e.g., Regular Cleaning">
          <button type="button" class="btn btn-sm btn-danger" onclick="removeSpecialty(this)">×</button>
        </div>
      `;
      return;
    } catch (err) {
      console.error('Worker API error:', err);
      alert('Could not save to server, saving locally instead.');
    }
  }

  // Fallback to localStorage when server is unavailable or no token
  if (id) {
    const idx = workers.findIndex(w => w.id === id);
    if (idx !== -1) {
      workers[idx] = { ...workers[idx], ...payload };
    } else {
      const newId = workers.length > 0 ? Math.max(...workers.map(w => w.id || 0)) + 1 : 1;
      workers.push({ ...payload, id: newId });
    }
  } else {
    const newId = workers.length > 0 ? Math.max(...workers.map(w => w.id || 0)) + 1 : 1;
    workers.push({ ...payload, id: newId });
  }

  // If not authenticated, save to pending queue so it can be synced later
  if (!token) {
    const pending = JSON.parse(localStorage.getItem('pendingWorkers') || '[]');
    const temp = { ...payload, _tempId: Date.now() };
    pending.push(temp);
    localStorage.setItem('pendingWorkers', JSON.stringify(pending));
  }

  // keep a local cache for offline rendering
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

function startAdminSSE() {
  const token = localStorage.getItem('adminToken');
  if (!token) return;
  // If EventSource already open, do nothing
  if (adminEventSource) return;

  // Use token as query param (EventSource cannot set Authorization header)
  const url = `/api/admin/events?token=${encodeURIComponent(token)}`;
  try {
    adminEventSource = new EventSource(url);

    adminEventSource.addEventListener('hello', (e) => {
      console.debug('SSE hello:', e.data);
    });

    adminEventSource.addEventListener('bookings-updated', async (e) => {
      try {
        console.info('Bookings updated event received');
        await loadBookings();
        await loadStats();
      } catch (err) {
        console.error('Error handling bookings-updated:', err);
      }
    });

    adminEventSource.onerror = (err) => {
      console.warn('SSE connection error, will attempt reconnect:', err);
      // Close and retry after a delay
      try { adminEventSource.close(); } catch (e) {}
      adminEventSource = null;
      setTimeout(startAdminSSE, 5000);
    };
  } catch (err) {
    console.error('Failed to start SSE:', err);
  }
}

function stopAdminSSE() {
  if (adminEventSource) {
    try { adminEventSource.close(); } catch (e) {}
    adminEventSource = null;
  }
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

    if (response.status === 401 || response.status === 403) {
      alert('Session expired or unauthorized. Please login again.');
      logout();
      return;
    }

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

async function deleteBooking(id) {
  const token = localStorage.getItem('adminToken');

  if (!confirm('Sei sicuro di voler eliminare questa prenotazione?')) return;

  // Store the booking for potential restoration
  const bookingToDelete = bookings.find(b => b.id === id);
  if (!bookingToDelete) {
    alert('Booking not found');
    return;
  }

  // Remove from local array immediately for UI feedback
  bookings = bookings.filter(b => b.id !== id);
  renderAllBookings();
  renderRecentBookings();
  loadStats(); // Update stats

  try {
    const res = await fetch(`/api/admin/bookings/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.status === 401 || res.status === 403) {
      alert('Session expired or unauthorized. Please login again.');
      logout();
      // Restore the booking since we couldn't delete it
      bookings.push(bookingToDelete);
      renderAllBookings();
      renderRecentBookings();
      loadStats();
      return;
    }

    if (res.ok) {
      alert('Prenotazione eliminata con successo.');
    } else {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Failed to delete booking');
    }
  } catch (error) {
    console.error('Error deleting booking:', error);
    alert('Failed to delete booking: ' + error.message);
    // Restore the booking since deletion failed
    bookings.push(bookingToDelete);
    renderAllBookings();
    renderRecentBookings();
    loadStats();
  }
}


async function clearAllBookings() {
  const token = localStorage.getItem('adminToken');
  if (!confirm('Sei sicuro di voler eliminare TUTTE le prenotazioni? Questa azione არის irreversibile.')) return;

  try {
    const response = await fetch('/api/admin/bookings/all/clear', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 401 || response.status === 403) {
      alert('Session expired or unauthorized. Please login again.');
      logout();
      return;
    }

    if (response.ok) {
      // Update UI immediately and ensure local state cleared
      bookings = [];
      renderAllBookings();
      renderRecentBookings();
      loadStats();
      alert('Tutte le prenotazioni sono state eliminate.');
      // reload to ensure server state consistency
      await loadDashboardData();
    } else {
      let errorMessage = `Server error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (jsonError) {
        // If response is not JSON, use status text
      }
      throw new Error(errorMessage);
    }
  } catch (error) {
    console.error('Clear all bookings error:', error);
    alert('Errore durante la cancellazione: ' + error.message);
  }
}

async function toggleWorker(id, active) {
  try {
    const worker = workers.find(w => w.id === id);
    if (!worker) throw new Error("Worker not found");
    const token = localStorage.getItem('adminToken');
    const res = await fetch(`/api/admin/workers/${id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : undefined
      },
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

async function deleteWorker(id) {
  const token = localStorage.getItem('adminToken');

  if (!confirm('Are you sure you want to delete this worker?')) return;

  const worker = workers.find(w => w.id === id);
  if (!worker) {
    alert('Worker not found');
    return;
  }

  // If authenticated, request server to delete
  if (token) {
    try {
      const res = await fetch(`/api/admin/workers/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401 || res.status === 403) {
        alert('Session expired or unauthorized. Please login again.');
        logout();
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete worker on server');
      }

      // Remove from local cache and pending queue if present
      workers = workers.filter(w => w.id !== id);
      localStorage.setItem('workers', JSON.stringify(workers));
      const pending = getPendingWorkers();
      const pendingFiltered = pending.filter(p => !(p.name === worker.name && p.email === worker.email && p.phone === worker.phone));
      setPendingWorkers(pendingFiltered);

      await loadWorkers();
      alert('Worker deleted successfully');
    } catch (err) {
      console.error('Error deleting worker:', err);
      alert('Failed to delete worker: ' + err.message);
    }

    return;
  }

  // Offline/local delete: remove from pending queue if matches, and from local workers cache
  try {
    const pending = getPendingWorkers();
    const pidx = pending.findIndex(p => p.name === worker.name && p.email === worker.email && p.phone === worker.phone);
    if (pidx !== -1) {
      pending.splice(pidx, 1);
      setPendingWorkers(pending);
    }

    workers = workers.filter(w => w.id !== id);
    localStorage.setItem('workers', JSON.stringify(workers));
    renderWorkers();
    alert('Worker removed locally. It will be synced with the server when you log in.');
  } catch (err) {
    console.error('Local delete error:', err);
    alert('Failed to remove worker locally: ' + err.message);
  }
}
function toggleLanguageDropdown() {
  const dropdown = document.getElementById('lang-options');
  if (dropdown) {
    dropdown.classList.toggle('active');
  }
}

function toggleMobileLangDropdown() {
  const dropdown = document.getElementById('mobile-lang-options');
  if (dropdown) {
    dropdown.classList.toggle('active');
  }
}

window.onload = () => {
  loadWorkers();
};
 
