(async () => {
  try {
    // Test admin login
    console.log('Testing admin login...');
    const loginRes = await fetch('http://localhost:5000/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'CasaClean', password: 'CasaClean2026' })
    });
    const loginData = await loginRes.json();
    console.log('Login Status:', loginRes.status);
    console.log('Login Response:', loginData);

    if (loginData.token) {
      // Test stats
      console.log('Testing admin stats...');
      const statsRes = await fetch('http://localhost:5000/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${loginData.token}` }
      });
      const statsData = await statsRes.json();
      console.log('Stats Status:', statsRes.status);
      console.log('Stats Response:', statsData);

      // Test bookings
      console.log('Testing admin bookings...');
      const bookingsRes = await fetch('http://localhost:5000/api/admin/bookings', {
        headers: { 'Authorization': `Bearer ${loginData.token}` }
      });
      const bookingsData = await bookingsRes.json();
      console.log('Bookings Status:', bookingsRes.status);
      console.log('Bookings Count:', bookingsData.length);
      console.log('Pending bookings:', bookingsData.filter(b => b.status === 'pending').length);
      console.log('Confirmed bookings:', bookingsData.filter(b => b.status === 'confirmed').length);
      console.log('Expired bookings:', bookingsData.filter(b => b.status === 'expired').length);
    }
  } catch (err) {
    console.error('Test failed:', err);
  }
})();
