let bookings = [];
let cities = [];
let services = [];

document.addEventListener('DOMContentLoaded', async () => {
  await checkSession();
  
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  
  document.querySelectorAll('.sidebar-menu li').forEach(item => {
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
      alert('Invalid credentials');
    }
  } catch (error) {
    console.error('Login failed:', error);
    alert('Login failed. Please try again.');
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
      <td>${booking.service_name}</td>
      <td>${booking.city_name}</td>
      <td>${formatDate(booking.booking_date)}</td>
      <td><span class="status-badge ${booking.status}">${booking.status}</span></td>
      <td>€${parseFloat(booking.total_amount).toFixed(2)}</td>
    </tr>
  `).join('');
  
  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-light);">No bookings yet</td></tr>';
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
      <td>${booking.service_name}</td>
      <td>${booking.city_name}</td>
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
    tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: var(--text-light);">No bookings found</td></tr>';
  }
}

function filterBookings() {
  renderAllBookings();
}

function showBookingDetails(id) {
  const booking = bookings.find(b => b.id === id);
  if (!booking) return;
  
  const details = document.getElementById('booking-details');
  details.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <label>Booking ID</label>
        <span>#${booking.id}</span>
      </div>
      <div class="detail-item">
        <label>Status</label>
        <span class="status-badge ${booking.status}">${booking.status}</span>
      </div>
      <div class="detail-item">
        <label>Customer Name</label>
        <span>${booking.customer_name}</span>
      </div>
      <div class="detail-item">
        <label>Email</label>
        <span>${booking.customer_email}</span>
      </div>
      <div class="detail-item">
        <label>Phone</label>
        <span>${booking.customer_phone}</span>
      </div>
      <div class="detail-item">
        <label>Service</label>
        <span>${booking.service_name}</span>
      </div>
      <div class="detail-item full-width">
        <label>Address</label>
        <span>${booking.customer_address}</span>
      </div>
      <div class="detail-item">
        <label>Date</label>
        <span>${formatDate(booking.booking_date)}</span>
      </div>
      <div class="detail-item">
        <label>Time</label>
        <span>${booking.booking_time}</span>
      </div>
      <div class="detail-item">
        <label>Duration</label>
        <span>${booking.hours} hours</span>
      </div>
      <div class="detail-item">
        <label>Cleaners</label>
        <span>${booking.cleaners}</span>
      </div>
      <div class="detail-item">
        <label>Total Amount</label>
        <span style="font-size: 1.25rem; font-weight: 600; color: var(--primary);">€${parseFloat(booking.total_amount).toFixed(2)}</span>
      </div>
      <div class="detail-item">
        <label>Payment Status</label>
        <span class="status-badge ${booking.stripe_status}">${booking.stripe_status}</span>
      </div>
      ${booking.payment_intent_id ? `
        <div class="detail-item full-width">
          <label>Payment Intent ID</label>
          <span style="font-size: 0.85rem; word-break: break-all;">${booking.payment_intent_id}</span>
        </div>
      ` : ''}
      ${booking.notes ? `
        <div class="detail-item full-width">
          <label>Special Instructions</label>
          <span>${booking.notes}</span>
        </div>
      ` : ''}
    </div>
  `;
  
  const actions = document.getElementById('booking-actions');
  if (booking.status === 'pending') {
    actions.innerHTML = `
      <button class="btn btn-danger" onclick="rejectBooking(${booking.id}); closeModal('booking-modal');">
        <i class="fas fa-times"></i> Reject
      </button>
      <button class="btn btn-success" onclick="confirmBooking(${booking.id}); closeModal('booking-modal');">
        <i class="fas fa-check"></i> Confirm & Charge
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
  if (!confirm('Confirm this booking and charge the customer?')) return;
  
  try {
    const response = await fetch(`/api/admin/bookings/${id}/confirm`, {
      method: 'POST',
    });
    
    if (response.ok) {
      alert('Booking confirmed successfully!');
      loadDashboardData();
    } else {
      throw new Error('Failed to confirm booking');
    }
  } catch (error) {
    console.error('Error confirming booking:', error);
    alert('Failed to confirm booking. Please try again.');
  }
}

async function rejectBooking(id) {
  if (!confirm('Reject this booking? The payment authorization will be released.')) return;
  
  try {
    const response = await fetch(`/api/admin/bookings/${id}/reject`, {
      method: 'POST',
    });
    
    if (response.ok) {
      alert('Booking rejected. Payment released.');
      loadDashboardData();
    } else {
      throw new Error('Failed to reject booking');
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
        ${city.name} / ${city.name_it}
        <label class="toggle-switch">
          <input type="checkbox" ${city.enabled ? 'checked' : ''} onchange="toggleCity(${city.id}, this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </h4>
      <div class="card-details">
        <p><i class="fas fa-clock"></i> ${city.working_hours_start} - ${city.working_hours_end}</p>
        <p><i class="fas fa-calendar"></i> Working days: ${formatWorkingDays(city.working_days)}</p>
      </div>
    </div>
  `).join('');
}

function formatWorkingDays(days) {
  const dayNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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
    alert('Please fill in all required fields');
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
    alert('Failed to add city. Please try again.');
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
  
  grid.innerHTML = services.map(service => `
    <div class="admin-card">
      <h4>
        ${service.name}
        <label class="toggle-switch">
          <input type="checkbox" ${service.enabled ? 'checked' : ''} onchange="toggleService(${service.id}, this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </h4>
      <div class="card-details">
        <p><i class="fas fa-globe"></i> IT: ${service.name_it}</p>
        <p>${service.description}</p>
      </div>
      <div class="card-price">€${parseFloat(service.price_per_hour).toFixed(2)} <span style="font-size: 0.9rem; font-weight: normal; color: var(--text-light);">/hour</span></div>
    </div>
  `).join('');
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

function switchTab(tab) {
  document.querySelectorAll('.sidebar-menu li').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });
  
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tab}-tab`);
  });
  
  const titles = {
    overview: 'Overview',
    bookings: 'Bookings',
    cities: 'Cities',
    services: 'Services',
  };
  document.getElementById('page-title').textContent = titles[tab] || 'Dashboard';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('active');
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
