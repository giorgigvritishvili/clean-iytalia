require('dotenv').config();
const express = require('express');

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

/**
 * GET Stripe config (publishable key)
 */
const getStripeConfig = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    res.json({
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  } catch (error) {
    console.error('Error getting Stripe config:', error);
    res.status(500).json({ error: 'Failed to get Stripe config' });
  }
};

/**
 * CREATE PAYMENT INTENT (manual capture)
 */
const createPaymentIntent = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    // ვიღებთ თანხას Frontend-იდან
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // მნიშვნელოვანი: რადგან შენი საიტიდან თანხა უკვე მოდის როგორც 380 (3.80-ის ნაცვლად),
    // აქ მეორედ აღარ ვამრავლებთ 100-ზე.
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(parseFloat(amount)), 
      currency: 'eur',
      payment_method_types: ['card'],
      capture_method: 'manual', // მხოლოდ ავტორიზაცია (ადმინმა უნდა დაადასტუროს)
    });

    console.log(`Payment Intent created: ${paymentIntent.id} for amount: ${paymentIntent.amount} cents`);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Stripe createPaymentIntent ERROR:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * CAPTURE PAYMENT (after admin confirmation)
 */
const capturePayment = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'PaymentIntent ID is required' });
    }

    const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);

    res.json({
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100, // ვაბრუნებთ ევროებში (დაყოფა 100-ზე)
    });
  } catch (error) {
    console.error('Stripe capturePayment ERROR:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * STRIPE CHECKOUT SESSION
 */
const createCheckoutSession = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    const { totalAmount, customerEmail, hours, cleaners } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Cleaning Service Booking',
              description: `${hours} hours • ${cleaners} cleaner(s)`,
            },
            // აქაც იგივე ლოგიკა: ვიყენებთ პირდაპირ totalAmount-ს
            unit_amount: Math.round(parseFloat(totalAmount)),
          },
          quantity: 1,
        },
      ],
      success_url: `${req.protocol}://${req.get('host')}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/stripe/cancel`,
      customer_email: customerEmail,
    });

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Stripe Checkout ERROR:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getStripeConfig,
  createPaymentIntent,
  capturePayment,
  createCheckoutSession,
};