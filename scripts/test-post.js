(async () => {
  try {
    const booking = {
      serviceId: 1,
      cityId: 1,
      customerName: 'Local Test 2',
      customerEmail: 'local2@test.example',
      customerPhone: '000',
      streetName: 'Via Test',
      houseNumber: '11',
      propertySize: '70',
      doorbellName: 'Test',
      bookingDate: '2026-02-04',
      bookingTime: '12:00',
      hours: 3,
      cleaners: 1,
      totalAmount: 75,
      paymentIntentId: 'test456',
      notes: 'test-post',
      additionalServices: [],
      supplies: []
    };

    const PORT = process.env.PORT || 3000;
    const res = await fetch(`http://localhost:${PORT}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(booking)
    });
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', data);
  } catch (err) {
    console.error('Request failed:', err);
  }
})();
