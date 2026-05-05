let contactPollingInterval = null; // For real-time contact updates

async function loadContact() {
  try {
    const res = await fetch('/api/contact');
    if (!res.ok) return;
    const c = await res.json();
    const email = c.email || '';
    const phone = c.phone || '';
    const whatsapp = c.whatsapp || '';

    const emailLink = document.getElementById('email-link');
    const emailText = document.getElementById('email-text');
    const phoneLink = document.getElementById('phone-link');
    const phoneText = document.getElementById('phone-text');
    const whatsappLink = document.getElementById('whatsapp-link');
    const whatsappText = document.getElementById('whatsapp-text');

    if (emailLink) emailLink.href = `mailto:${email}`;
    if (emailText) emailText.textContent = email;

    if (phoneLink) phoneLink.href = `tel:${phone}`;
    if (phoneText) phoneText.textContent = phone;

    if (whatsappLink) {
      // strip non-digits for wa.me
      const digits = (whatsapp || phone || '').replace(/[^0-9]/g, '');
      if (digits) whatsappLink.href = `https://wa.me/${digits}`;
    }
    if (whatsappText) whatsappText.textContent = whatsapp || phone || '';
  } catch (e) {
    console.error('Failed to load contact config', e);
  }
}

function startContactPolling() {
  if (contactPollingInterval) return; // Already polling
  contactPollingInterval = setInterval(loadContact, 10000); // Poll every 10 seconds
}

function stopContactPolling() {
  if (contactPollingInterval) {
    clearInterval(contactPollingInterval);
    contactPollingInterval = null;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadContact();
  startContactPolling(); // Start polling for real-time updates
});