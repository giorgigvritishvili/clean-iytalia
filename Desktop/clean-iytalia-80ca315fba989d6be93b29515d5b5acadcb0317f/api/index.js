const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Import controllers
const stripeController = require('../controller/stripe.controller');

// Routes
router.post('/create-payment-intent', stripeController.createPaymentIntent);

// Public contact endpoint
router.get('/contact', (req, res) => {
  try {
    const contactPath = path.join(__dirname, '../data/contact.json');
    const contactData = JSON.parse(fs.readFileSync(contactPath, 'utf8'));
    res.json(contactData);
  } catch (error) {
    console.error('Error reading contact data:', error);
    res.status(500).json({ error: 'Failed to load contact information' });
  }
});

// Export router
module.exports = router;
