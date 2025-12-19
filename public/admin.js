let bookings = [];
let cities = [];
let services = [];

document.addEventListener('DOMContentLoaded', () => {
  initTranslations(renderDynamicContent);
  initAdminEventListeners();
  checkSession();
});

function initAdminEventListeners() {
  // Login
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);

  // Navigation
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('mobile-sidebar-toggle')?.addEventListener('click', toggleSidebar);
  document.querySelectorAll('.sidebar-menu li').forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });

  // Filtering
  document.getElementById('status-filter')?.addEventListener('change', renderAllBookings);

  // Modals
  document.getElementById('add-city-btn')?.addEventListener('click', () => openModal('city-modal'));
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modalId));
  });
  document.getElementById('save-city-btn')?.addEventListener('click', handleCityFormSubmit);

  // Event delegation for dynamic content
  document.getElementById('recent-bookings')?.addEventListener('click', handleTableClick);
  document.getElementById('all-bookings')?.addEventListener('click', handleTableClick);
  document.getElementById('cities-grid')?.addEventListener('click', handleCitiesGridClick);
  document.getElementById('services-grid-admin')?.addEventListener('click', handleServicesGridClick);
}

async function checkSession() {
  try {
    const response = await fetch('/api/admin/check-session');
    if (response.ok) {
      const data = await response.json();
      if (data.authenticated) {
        showDashboard();
      } else {
        showLogin();
      }
    } else {
      showLogin();
    }
  } catch (error) {
    console.error('Session check failed:', error);
    showLogin();
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

    if (response.ok) {
      showDashboard();
    } else {
      alert(i18n('admin.alerts.invalidCredentials'));
    }
  } catch (error) {
    console.error('Login failed:', error);
    alert(i18n('admin.alerts.loginFailed'));
  }
}

async function handleLogout() {
  try {
    await fetch('/api/admin/logout', { method: 'POST' });
    showLogin();
  } catch (error) {
    console.error('Logout failed:', error);
  }
}

function showDashboard() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('dashboard').style.display = 'flex';
  loadDashboardData();
}

function showLogin() {
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
}

async function loadDashboardData() {
  try {
    const [statsRes, bookingsRes, citiesRes, servicesRes] = await Promise.all([
      fetch('/api/admin/stats'),
      fetch('/api/admin/bookings'),
      fetch('/api/admin/cities'),
      fetch('/api/admin/services'),
    ]);
    const stats = await statsRes.json();
    bookings = await bookingsRes.json();
    cities = await citiesRes.json();
    services = await servicesRes.json();
    
    document.getElementById('stat-total').textContent = stats.totalBookings;
    document.getElementById('stat-pending').textContent = stats.pendingBookings;
    document.getElementById('stat-confirmed').textContent = stats.confirmedBookings;
    document.getElementById('stat-revenue').textContent = `€${parseFloat(stats.totalRevenue).toFixed(2)}`;

    renderDynamicContent();
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
  }
}

function renderDynamicContent() {
  renderRecentBookings();
  renderAllBookings();
  renderCities();
  renderServices();
}

function renderRecentBookings() {
  const tbody = document.getElementById('recent-bookings');
  const recent = bookings.slice(0, 5);
  tbody.innerHTML = ''; // Clear existing
  
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center">${i18n('admin.bookings.noBookings')}</td></tr>`;
    return;
  }

  recent.forEach(booking => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.dataset.bookingId = booking.id;
    tr.innerHTML = `
      <td>#${booking.id}</td>
      <td>${booking.customer_name}</td>
      <td>${booking.service_name}</td>
      <td>${booking.city_name}</td>
      <td>${formatDate(booking.booking_date)}</td>
      <td><span class="status-badge ${booking.status}">${booking.status}</span></td>
      <td>€${parseFloat(booking.total_amount).toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAllBookings() {
  const tbody = document.getElementById('all-bookings');
  const statusFilter = document.getElementById('status-filter').value;
  
  const filtered = statusFilter ? bookings.filter(b => b.status === statusFilter) : bookings;
  tbody.innerHTML = ''; // Clear existing
  
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center">${i18n('admin.bookings.noBookings')}</td></tr>`;
    return;
  }

  filtered.forEach(booking => {
    const tr = document.createElement('tr');
    tr.dataset.bookingId = booking.id;
    tr.innerHTML = `
      <td>#${booking.id}</td>
      <td>${booking.customer_name}</td>
      <td>
        <div class="contact-info">${booking.customer_email}</div>
        <div class="contact-info sub-text">${booking.customer_phone}</div>
      </td>
      <td>${booking.service_name_it || booking.service_name}</td>
      <td>${booking.city_name_it || booking.city_name}</td>
      <td>
        <div>${formatDate(booking.booking_date)}</div>
        <div class="sub-text">${booking.booking_time}</div>
      </td>
      <td>${booking.hours}h x ${booking.cleaners}</td>
      <td>€${parseFloat(booking.total_amount).toFixed(2)}</td>
      <td><span class="status-badge ${booking.stripe_status}">${booking.stripe_status}</span></td>
      <td><span class="status-badge ${booking.status}">${booking.status}</span></td>
      <td>
        <div class="action-btns">
          <button class="btn btn-sm btn-secondary" data-action="view"><i class="fas fa-eye"></i></button>
          ${booking.status === 'pending' ? `
            <button class="btn btn-sm btn-success" data-action="confirm"><i class="fas fa-check"></i></button>
            <button class="btn btn-sm btn-danger" data-action="reject"><i class="fas fa-times"></i></button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderCities() {
  const grid = document.getElementById('cities-grid');
  grid.innerHTML = '';
  cities.forEach(city => {
    const card = document.createElement('div');
    card.className = 'admin-card';
    card.dataset.cityId = city.id;
    card.innerHTML = `
      <h4>
        ${city.name} / ${city.name_it}
        <label class="toggle-switch">
          <input type="checkbox" data-action="toggle-enabled" ${city.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </h4>
      <div class="card-details">
        <p><i class="fas fa-clock"></i> ${city.working_hours_start} - ${city.working_hours_end}</p>
        <p><i class="fas fa-calendar"></i> ${i18n('admin.cities.workingDays')}: ${formatWorkingDays(city.working_days)}</p>
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderServices() {
  const grid = document.getElementById('services-grid-admin');
  grid.innerHTML = '';
  services.forEach(service => {
    const card = document.createElement('div');
    card.className = 'admin-card';
    card.dataset.serviceId = service.id;
    card.innerHTML = `
      <h4>
        ${service.name}
        <label class="toggle-switch">
          <input type="checkbox" data-action="toggle-enabled" ${service.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </h4>
      <div class="card-details">
        <p><i class="fas fa-globe"></i> ${i18n('admin.services.nameIt')} ${service.name_it}</p>
        <p>${service.description}</p>
      </div>
      <div class="card-price">€${parseFloat(service.price_per_hour).toFixed(2)} <span>${i18n('services.perHour')}</span></div>
    `;
    grid.appendChild(card);
  });
}

function handleTableClick(e) {
  const target = e.target.closest('button, tr');
  if (!target) return;
  
  const bookingId = parseInt(target.closest('tr').dataset.bookingId);
  const action = target.dataset.action;

  if (action === 'view' || target.tagName === 'TR') {
    showBookingDetails(bookingId);
  } else if (action === 'confirm') {
    confirmBooking(bookingId);
  } else if (action === 'reject') {
    rejectBooking(bookingId);
  }
}

function handleCitiesGridClick(e) {
  const toggle = e.target.closest('input[data-action="toggle-enabled"]');
  if (toggle) {
    const cityId = parseInt(toggle.closest('.admin-card').dataset.cityId);
    toggleCity(cityId, toggle.checked);
  }
}

function handleServicesGridClick(e) {
  const toggle = e.target.closest('input[data-action="toggle-enabled"]');
  if (toggle) {
    const serviceId = parseInt(toggle.closest('.admin-card').dataset.serviceId);
    toggleService(serviceId, toggle.checked);
  }
}

async function showBookingDetails(id) {
  const booking = bookings.find(b => b.id === id);
  if (!booking) return;

  const details = document.getElementById('booking-details');
  details.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><label>${i18n('admin.bookings.bookingId')}</label><span>#${booking.id}</span></div>
      <div class="detail-item"><label>${i18n('admin.bookings.status')}</label><span class="status-badge ${booking.status}">${booking.status}</span></div>
      <div class="detail-item"><label>${i18n('admin.bookings.customerName')}</label><span>${booking.customer_name}</span></div>
      <div class="detail-item"><label>${i18n('admin.bookings.email')}</label><span>${booking.customer_email}</span></div>
      <div class="detail-item"><label>${i18n('admin.bookings.phone')}</label><span>${booking.customer_phone}</span></div>
      <div class="detail-item"><label>${i18n('admin.bookings.service')}</label><span>${booking.service_name_it || booking.service_name}</span></div>
      <div class="detail-item full-width"><label>${i18n('admin.bookings.address')}</label><span>${booking.customer_address}</span></div>
      <div class="detail-item"><label>${i18n('admin.bookings.date')}</label><span>${formatDate(booking.booking_date)}</span></div>
      <div class="detail-item"><label>${i18n('admin.bookings.time')}</label><span>${booking.booking_time}</span></div>
      <div class="detail-item"><label>${i18n('admin.bookings.hours')}</label><span>${booking.hours} hours</span></div>
      <div class="detail-item"><label>${i18n('admin.bookings.cleaners')}</label><span>${booking.cleaners}</span></div>
      <div class="detail-item"><label>${i18n('admin.bookings.totalAmount')}</label><span class="detail-amount">€${parseFloat(booking.total_amount).toFixed(2)}</span></div>
      <div class="detail-item"><label>${i18n('admin.bookings.paymentStatus')}</label><span class="status-badge ${booking.stripe_status}">${booking.stripe_status}</span></div>
      ${booking.payment_intent_id ? `<div class="detail-item full-width"><label>${i18n('admin.bookings.paymentIntentId')}</label><span class="detail-small-text">${booking.payment_intent_id}</span></div>` : ''}
      ${booking.notes ? `<div class="detail-item full-width"><label>${i18n('admin.bookings.specialInstructions')}</label><span>${booking.notes}</span></div>` : ''}
    </div>`;

  const actions = document.getElementById('booking-actions');
  actions.innerHTML = '';
  if (booking.status === 'pending') {
    actions.innerHTML = `
      <button type="button" class="btn btn-danger" data-action="reject" data-booking-id="${id}"><i class="fas fa-times"></i> ${i18n('admin.bookings.reject')}</button>
      <button type="button" class="btn btn-success" data-action="confirm" data-booking-id="${id}"><i class="fas fa-check"></i> ${i18n('admin.bookings.confirmCharge')}</button>`;
    actions.querySelector('[data-action="reject"]').addEventListener('click', () => { rejectBooking(id); closeModal('booking-modal'); });
    actions.querySelector('[data-action="confirm"]').addEventListener('click', () => { confirmBooking(id); closeModal('booking-modal'); });
  } else {
    actions.innerHTML = `
      <a href="mailto:${booking.customer_email}" class="btn btn-secondary"><i class="fas fa-envelope"></i> ${i18n('admin.bookings.email')}</a>
      <a href="tel:${booking.customer_phone}" class="btn btn-secondary"><i class="fas fa-phone"></i> ${i18n('admin.bookings.call')}</a>
      <a href="https://wa.me/${booking.customer_phone.replace(/[^0-9]/g, '')}" target="_blank" class="btn btn-success"><i class="fab fa-whatsapp"></i> ${i18n('admin.bookings.whatsapp')}</a>`;
  }
  openModal('booking-modal');
}

async function confirmBooking(id) {
  if (!confirm(i18n('admin.alerts.confirmBooking'))) return;
  try {
    const response = await fetch(`/api/admin/bookings/${id}/confirm`, { method: 'POST' });
    if (!response.ok) throw new Error('Confirm API call failed');
    alert(i18n('admin.alerts.bookingConfirmed'));
    loadDashboardData();
  } catch (error) {
    console.error('Error confirming booking:', error);
    alert(i18n('admin.alerts.confirmFailed'));
  }
}

async function rejectBooking(id) {
  if (!confirm(i18n('admin.alerts.rejectBooking'))) return;
  try {
    const response = await fetch(`/api/admin/bookings/${id}/reject`, { method: 'POST' });
    if (!response.ok) throw new Error('Reject API call failed');
    alert(i18n('admin.alerts.bookingRejected'));
    loadDashboardData();
  } catch (error) {
    console.error('Error rejecting booking:', error);
    alert(i18n('admin.alerts.rejectFailed'));
  }
}

async function toggleCity(id, enabled) {
  try {
    const city = cities.find(c => c.id === id);
    const response = await fetch(`/api/admin/cities/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...city, enabled }),
    });
    if (!response.ok) throw new Error('Toggle city failed');
    city.enabled = enabled; // Update local state
  } catch (error) {
    console.error('Failed to update city:', error);
    alert(i18n('admin.alerts.updateFailed'));
    loadCities(); // Re-fetch to be safe
  }
}

async function toggleService(id, enabled) {
  try {
    const service = services.find(s => s.id === id);
    const response = await fetch(`/api/admin/services/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...service, enabled }),
    });
    if (!response.ok) throw new Error('Toggle service failed');
    service.enabled = enabled; // Update local state
  } catch (error) {
    console.error('Failed to update service:', error);
    alert(i18n('admin.alerts.updateFailed'));
    loadServices(); // Re-fetch to be safe
  }
}

async function handleCityFormSubmit() {
  const name = document.getElementById('city-name').value;
  const nameIt = document.getElementById('city-name-it').value;
  const start = document.getElementById('city-start').value;
  const end = document.getElementById('city-end').value;
  const checkedDays = Array.from(document.querySelectorAll('#city-form .checkbox-group input:checked')).map(cb => cb.value);

  if (!name || !nameIt) {
    alert(i18n('admin.alerts.fillRequired'));
    return;
  }

  try {
    const response = await fetch('/api/admin/cities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        name_it: nameIt,
        working_days: checkedDays.join(','),
        working_hours_start: start,
        working_hours_end: end,
      }),
    });
    if (!response.ok) throw new Error('Add city failed');
    closeModal('city-modal');
    loadCities();
  } catch (error) {
    console.error('Failed to add city:', error);
    alert(i18n('admin.alerts.addCityFailed'));
  }
}

function switchTab(tab) {
  document.querySelectorAll('.sidebar-menu li').forEach(item => item.classList.remove('active'));
  document.querySelector(`.sidebar-menu li[data-tab="${tab}"]`).classList.add('active');
  
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  document.getElementById(`${tab}-tab`).classList.add('active');
  
  document.getElementById('page-title').textContent = i18n(`admin.nav.${tab}`);
}

function openModal(id) {
  document.getElementById(id)?.classList.add('active');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
}

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('active');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString(currentLanguage === 'it' ? 'it-IT' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatWorkingDays(days) {
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days.split(',').map(d => i18n(`admin.cities.${dayKeys[parseInt(d)]}`)).join(', ');
}