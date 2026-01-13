let bookings = [];
let cities = [];
let services = [];

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
  try {
    const response = await fetch('/api/admin/check-session');
    const data = await response.json();
    
    if (data.authenticated) {
      showDashboard();
    }
  } catch (error) {
    console.error('Session check failed:', error);
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
      alert((getAdminTranslations().messages && getAdminTranslations().messages.invalidCredentials) || 'Invalid credentials');
    }
  } catch (error) {
    console.error('Login failed:', error);
      alert((getAdminTranslations().messages && getAdminTranslations().messages.loginFailedTry) || 'Login failed. Please try again.');
  }
}

async function logout() {
  try {
    await fetch('/api/admin/logout', { method: 'POST' });
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
}

async function loadDashboardData() {
  await Promise.all([
    loadStats(),
    loadBookings(),
    loadCities(),
    loadServices(),
    loadContactInfo(),
  ]);
}

async function loadStats() {
  try {
    const response = await fetch('/api/admin/stats');
    const stats = await response.json();
    
    document.getElementById('stat-total').textContent = stats.totalBookings;
    document.getElementById('stat-pending').textContent = stats.pendingBookings;
    document.getElementById('stat-confirmed').textContent = stats.confirmedBookings;
    document.getElementById('stat-revenue').textContent = `€${stats.totalRevenue.toFixed(2)}`;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

async function loadBookings() {
  try {
    const response = await fetch('/api/admin/bookings');
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
  
  tbody.innerHTML = recent.map(booking => `
    <tr onclick="showBookingDetails(${booking.id})" style="cursor: pointer;">
      <td>#${booking.id}</td>
      <td>${booking.customer_name}</td>
      <td>${booking.service_name_it || booking.service_name}</td>
      <td>${booking.city_name_it || booking.city_name}</td>
      <td>${formatDate(booking.booking_date)}</td>
      <td><span class="status-badge ${booking.status}">${booking.status}</span></td>
      <td>€${parseFloat(booking.total_amount).toFixed(2)}</td>
    </tr>
  `).join('');
  
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
  
  tbody.innerHTML = filtered.map(booking => `
    <tr>
      <td>#${booking.id}</td>
      <td>${booking.customer_name}</td>
      <td>
        <div style="font-size: 0.85rem;">${booking.customer_email}</div>
        <div style="font-size: 0.8rem; color: var(--text-light);">${booking.customer_phone}</div>
      </td>
      <td>${booking.service_name_it || booking.service_name}</td>
      <td>${booking.city_name_it || booking.city_name}</td>
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
  `).join('');
  
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
        <span>${booking.service_name_it || booking.service_name}</span>
      </div>
      <div class="detail-item full-width">
        <label>${'Address'}</label>
        <span>${booking.customer_address}</span>
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
        <span>${booking.hours} ${(Lbooking.hoursOptions ? 'hours' : 'hours')}</span>
      </div>
      <div class="detail-item">
        <label>${Lbooking.cleaners || 'Cleaners'}</label>
        <span>${booking.cleaners}</span>
      </div>
      <div class="detail-item">
        <label>${Ltable.amount || 'Total Amount'}</label>
        <span style="font-size: 1.25rem; font-weight: 600; color: var(--primary);">€${parseFloat(booking.total_amount).toFixed(2)}</span>
      </div>
      <div class="detail-item">
        <label>${Ltable.payment || 'Payment Status'}</label>
        <span class="status-badge ${booking.stripe_status}">${booking.stripe_status}</span>
      </div>
      ${booking.payment_intent_id ? `
        <div class="detail-item full-width">
          <label>${'Payment Intent ID'}</label>
          <span style="font-size: 0.85rem; word-break: break-all;">${booking.payment_intent_id}</span>
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
      <button class="btn btn-success" onclick="confirmBooking(${booking.id}); closeModal('booking-modal');">
        <i class="fas fa-check"></i> ${A.confirmAndCharge || 'Confirm & Charge'}
      </button>
    `;
  } else {
    actions.innerHTML = `
      <a href="mailto:${booking.customer_email}" class="btn btn-secondary">
        <i class="fas fa-envelope"></i> Email
      </a>
      <a href="tel:${booking.customer_phone}" class="btn btn-secondary">
        <i class="fas fa-phone"></i> Call
      </a>
      <a href="https://wa.me/${booking.customer_phone.replace(/[^0-9]/g, '')}" target="_blank" class="btn btn-success">
        <i class="fab fa-whatsapp"></i> WhatsApp
      </a>
    `;
  }
  
  document.getElementById('booking-modal').classList.add('active');
}

async function confirmBooking(id) {
  if (!confirm((getAdminTranslations().messages && getAdminTranslations().messages.confirmConfirmBooking) || 'Confirm this booking and charge the customer?')) return;
  
  try {
    const response = await fetch(`/api/admin/bookings/${id}/confirm`, {
      method: 'POST',
    });
    
    if (response.ok) {
      alert((getAdminTranslations().messages && getAdminTranslations().messages.confirmBookingSuccess) || 'Booking confirmed successfully!');
      loadDashboardData();
    } else {
      throw new Error((getAdminTranslations().messages && getAdminTranslations().messages.confirmBookingFailed) || 'Failed to confirm booking');
    }
  } catch (error) {
    console.error('Error confirming booking:', error);
    alert('Failed to confirm booking. Please try again.');
  }
}

async function rejectBooking(id) {
  if (!confirm((getAdminTranslations().messages && getAdminTranslations().messages.confirmRejectBooking) || 'Reject this booking? The payment authorization will be released.')) return;
  
  try {
    const response = await fetch(`/api/admin/bookings/${id}/reject`, {
      method: 'POST',
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
  try {
    const response = await fetch('/api/admin/cities');
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
  try {
    const city = cities.find(c => c.id === id);
    await fetch(`/api/admin/cities/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled,
        working_days: city.working_days,
        working_hours_start: city.working_hours_start,
        working_hours_end: city.working_hours_end,
      }),
    });
  } catch (error) {
    console.error('Failed to update city:', error);
    loadCities();
  }
}

function showAddCityModal() {
  document.getElementById('city-form').reset();
  document.getElementById('city-modal').classList.add('active');
}

async function addCity() {
  const name = document.getElementById('city-name').value;
  const nameIt = document.getElementById('city-name-it').value;
  const start = document.getElementById('city-start').value;
  const end = document.getElementById('city-end').value;
  
  const checkedDays = [];
  document.querySelectorAll('#city-form .checkbox-group input:checked').forEach(cb => {
    checkedDays.push(cb.value);
  });
  
  if (!name || !nameIt) {
    alert((getAdminTranslations().messages && getAdminTranslations().messages.pleaseFillFields) || 'Please fill in all required fields');
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
    
    if (response.ok) {
      closeModal('city-modal');
      loadCities();
    } else {
      throw new Error('Failed to add city');
    }
  } catch (error) {
    console.error('Failed to add city:', error);
    alert((getAdminTranslations().messages && getAdminTranslations().messages.failedAddCity) || 'Failed to add city. Please try again.');
  }
}

async function loadServices() {
  try {
    const response = await fetch('/api/admin/services');
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
    await fetch(`/api/admin/services/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled,
        price_per_hour: service.price_per_hour,
      }),
    });
  } catch (error) {
    console.error('Failed to update service:', error);
    loadServices();
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
  document.getElementById('service-description').value = service.description;
  document.getElementById('service-description-it').value = service.description_it;
  document.getElementById('service-price').value = service.price_per_hour;
  document.getElementById('service-enabled').value = service.enabled.toString();

  document.getElementById('service-submit-btn').textContent = (getAdminTranslations().actions && getAdminTranslations().actions.updateService) || 'Update Service';
  document.getElementById('service-submit-btn').onclick = () => saveService(id);
  document.getElementById('service-modal').classList.add('active');
}

async function saveService(id = null) {
  const name = document.getElementById('service-name').value;
  const nameIt = document.getElementById('service-name-it').value;
  const description = document.getElementById('service-description').value;
  const descriptionIt = document.getElementById('service-description-it').value;
  const price = parseFloat(document.getElementById('service-price').value);
  const enabled = document.getElementById('service-enabled').value === 'true';

  if (!name || !nameIt || !description || !descriptionIt || isNaN(price)) {
    alert((getAdminTranslations().messages && getAdminTranslations().messages.pleaseFillFields) || 'Please fill in all required fields');
    return;
  }

  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/admin/services/${id}` : '/api/admin/services';
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        name_it: nameIt,
        description,
        description_it: descriptionIt,
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
    alert((getAdminTranslations().messages && getAdminTranslations().messages.failedSaveService) || 'Failed to save service. Please try again.');
  }
}

async function deleteService(id) {
  if (!confirm('Sei sicuro di voler eliminare questo servizio? Questa azione è irreversibile.')) return;

  try {
    const response = await fetch(`/api/admin/services/${id}`, {
      method: 'DELETE',
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
  document.getElementById(id).classList.remove('active');
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
async function loadContactInfo() {
  try {
    const res = await fetch('/api/contact');
    if (!res.ok) return;
    const c = await res.json();
    const emailInput = document.getElementById('contact-email');
    const phoneInput = document.getElementById('contact-phone');
    const waInput = document.getElementById('contact-whatsapp');
    if (emailInput) emailInput.value = c.email || '';
    if (phoneInput) phoneInput.value = c.phone || '';
    if (waInput) waInput.value = c.whatsapp || '';
  } catch (e) {
    console.error('Failed to load contact info', e);
  }
}

async function saveContactInfo() {
  try {
    const email = (document.getElementById('contact-email') || {}).value || '';
    const phone = (document.getElementById('contact-phone') || {}).value || '';
    const whatsapp = (document.getElementById('contact-whatsapp') || {}).value || '';

    const res = await fetch('/api/admin/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone, whatsapp }),
    });

    if (res.ok) {
      alert('Contact info saved');
      // reload public-facing contact elements if admin page is visible
      await loadContactInfo();
    } else {
      const txt = await res.text();
      throw new Error(txt || 'Save failed');
    }
  } catch (e) {
    console.error('Failed to save contact info', e);
    alert('Failed to save contact info');
  }
}

function filterMyProjects() {
  // TODO: Filter projects by status
  loadMyProjects();
}

function loadAppointmentCalendar() {
  // TODO: Load appointment calendar
  const calendar = document.getElementById('appointment-calendar');
  calendar.innerHTML = '<div class="calendar-placeholder"><p>La visualizzazione del calendario verrà implementata qui...</p></div>';
}

function changeCalendarView() {
  // TODO: Change calendar view (month/week/day)
  loadAppointmentCalendar();
}

function loadMyAppointments() {
  // TODO: Load user's appointments
  const table = document.getElementById('my-appointments-table');
  table.innerHTML = '<tr><td colspan="7" style="text-align: center;">I tuoi appuntamenti verranno caricati qui...</td></tr>';
}

function filterMyAppointments() {
  // TODO: Filter appointments by status
  loadMyAppointments();
}

function loadEarnings() {
  // TODO: Load earnings data
  // Update stats
  document.getElementById('total-earnings').textContent = '€0';
  document.getElementById('monthly-earnings').textContent = '€0';
  document.getElementById('pending-earnings').textContent = '€0';
  document.getElementById('commission-rate').textContent = '0%';

  // Update earnings history
  const history = document.getElementById('earnings-history');
  history.innerHTML = '<tr><td colspan="5" style="text-align: center;">La cronologia delle entrate verrà caricata qui...</td></tr>';
}

function loadPayoutRequests() {
  // TODO: Load payout requests
  const requests = document.getElementById('payout-requests');
  requests.innerHTML = '<tr><td colspan="6" style="text-align: center;">Le richieste di pagamento verranno caricate qui...</td></tr>';
}

function requestPayout() {
  // TODO: Show payout request modal
  alert((getAdminTranslations().messages && getAdminTranslations().messages.payoutPlaceholder) || 'La funzionalità di richiesta pagamento sarà implementata qui.');
}

function loadCommissionInvoices() {
  // TODO: Load commission invoices
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
  // TODO: Load workers data
  const grid = document.getElementById('workers-grid');
  grid.innerHTML = '<div class="admin-card"><p>Workers will be loaded here...</p></div>';
}

function showAddProjectModal() {
  // TODO: Show add project modal
  alert((getAdminTranslations().messages && getAdminTranslations().messages.addProjectPlaceholder) || 'La finestra per aggiungere un progetto sarà implementata qui.');
}

function showAddWorkerModal() {
  // TODO: Show add worker modal
  alert((getAdminTranslations().messages && getAdminTranslations().messages.addWorkerPlaceholder) || 'La finestra per aggiungere un operatore sarà implementata qui.');
}
