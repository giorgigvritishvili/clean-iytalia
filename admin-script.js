// admin-script.js

document.addEventListener('DOMContentLoaded', function() {
    const tabs = ['bookings', 'calendar', 'locations', 'payments', 'customers'];

    function showTab(tab) {
        tabs.forEach(t => {
            document.getElementById(`${t}-section`).classList.add('hidden');
            document.getElementById(`${t}-tab`).classList.remove('active');
        });
        document.getElementById(`${tab}-section`).classList.remove('hidden');
        document.getElementById(`${tab}-tab`).classList.add('active');
    }

    document.getElementById('bookings-tab').addEventListener('click', () => showTab('bookings'));
    document.getElementById('calendar-tab').addEventListener('click', () => { showTab('calendar'); renderCalendar(); });
    document.getElementById('locations-tab').addEventListener('click', () => showTab('locations'));
    document.getElementById('payments-tab').addEventListener('click', () => showTab('payments'));
    document.getElementById('customers-tab').addEventListener('click', () => showTab('customers'));

    // Load bookings
    function loadBookings() {
        const tbody = document.getElementById('bookings-tbody');
        tbody.innerHTML = '';
        const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
        bookings.forEach(booking => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${booking.id}</td>
                <td>${booking.service}</td>
                <td>${booking.city}</td>
                <td>${booking.date}</td>
                <td>${booking.time}</td>
                <td>${booking.status}</td>
                <td>
                    ${booking.status === 'pending' ? `<button class="confirm" data-id="${booking.id}">Confirm</button><button class="reject" data-id="${booking.id}">Reject</button>` : ''}
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    loadBookings();

    // Booking actions
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('confirm')) {
            const id = e.target.dataset.id;
            updateBookingStatus(id, 'confirmed');
            alert('Booking confirmed. Payment captured.');
        } else if (e.target.classList.contains('reject')) {
            const id = e.target.dataset.id;
            updateBookingStatus(id, 'cancelled');
            alert('Booking rejected. Payment released.');
        }
    });

    function updateBookingStatus(id, status) {
        let bookings = JSON.parse(localStorage.getItem('bookings')) || [];
        bookings = bookings.map(b => b.id == id ? {...b, status} : b);
        localStorage.setItem('bookings', JSON.stringify(bookings));
        loadBookings();
    }

    // Calendar
    let selectedDate = null;
    let blockedSlots = JSON.parse(localStorage.getItem('blockedSlots')) || [];

    function renderCalendar() {
        const calendar = document.getElementById('calendar');
        calendar.innerHTML = '';
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();

        // Days of week
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
            const div = document.createElement('div');
            div.textContent = day;
            div.style.fontWeight = 'bold';
            calendar.appendChild(div);
        });

        // Empty cells
        for (let i = 0; i < firstDay; i++) {
            const div = document.createElement('div');
            calendar.appendChild(div);
        }

        // Days
        for (let day = 1; day <= daysInMonth; day++) {
            const div = document.createElement('div');
            div.className = 'calendar-day';
            div.textContent = day;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            if (blockedSlots.includes(dateStr)) {
                div.classList.add('blocked');
            }
            div.addEventListener('click', () => {
                document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
                div.classList.add('selected');
                selectedDate = dateStr;
            });
            calendar.appendChild(div);
        }

        document.getElementById('blocked-slots').textContent = blockedSlots.join(', ');
    }

    document.getElementById('block-slot').addEventListener('click', () => {
        if (selectedDate && !blockedSlots.includes(selectedDate)) {
            blockedSlots.push(selectedDate);
            localStorage.setItem('blockedSlots', JSON.stringify(blockedSlots));
            renderCalendar();
        }
    });

    // Locations
    document.getElementById('add-city').addEventListener('click', () => {
        const newCity = document.getElementById('new-city').value;
        if (newCity) {
            const li = document.createElement('li');
            li.innerHTML = `${newCity} - Active <button class="toggle-city" data-city="${newCity.toLowerCase()}">Deactivate</button>`;
            document.getElementById('locations-list').appendChild(li);
            document.getElementById('new-city').value = '';
        }
    });

    // Payments and Customers - load from bookings
    function loadPaymentsAndCustomers() {
        const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
        const paymentsTbody = document.getElementById('payments-tbody');
        const customersTbody = document.getElementById('customers-tbody');
        paymentsTbody.innerHTML = '';
        customersTbody.innerHTML = '';

        bookings.forEach(booking => {
            // Payments
            const paymentRow = document.createElement('tr');
            paymentRow.innerHTML = `
                <td>${booking.id}</td>
                <td>${booking.status}</td>
                <td>€${booking.hours * 20}</td>
                <td>stripe_${booking.id}</td>
            `;
            paymentsTbody.appendChild(paymentRow);

            // Customers
            const customerRow = document.createElement('tr');
            customerRow.innerHTML = `
                <td>${booking.name}</td>
                <td>${booking.email}</td>
                <td>${booking.phone}</td>
                <td><button>Contact</button></td>
            `;
            customersTbody.appendChild(customerRow);
        });
    }

    loadPaymentsAndCustomers();
});