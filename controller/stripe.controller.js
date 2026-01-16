

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

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
 b};

const createPaymentIntent = async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'eur',
            automatic_payment_methods: {
                enabled: true,
            },
            capture_method: 'manual', // Authorize only, capture later
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
        });
    } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).json({ error: 'Failed to create payment intent' });
    }
};

const capturePayment = async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({ error: 'Stripe is not configured' });
        }

        const { paymentIntentId } = req.body;

        if (!paymentIntentId) {
            return res.status(400).json({ error: 'Payment intent ID is required' });
        }

        const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);

        res.json({
            status: paymentIntent.status,
            amount: paymentIntent.amount / 100,
        });
    } catch (error) {
        console.error('Error capturing payment:', error);
        res.status(500).json({ error: 'Failed to capture payment' });
    }
};

const createCheckoutSession = async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({ error: 'Stripe is not configured' });
        }

        const {
            serviceId, cityId, customerName, customerEmail, customerPhone,
            customerAddress, bookingDate, bookingTime, hours, cleaners,
            totalAmount, notes, additionalServices, supplies, streetName,
            houseNumber, propertySize, doorbellName
        } = req.body;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: 'Cleaning Service Booking',
                        description: `Cleaning service for ${hours} hours with ${cleaners} cleaner(s)`,
                    },
                    unit_amount: Math.round(totalAmount * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.protocol}://${req.get('host')}/stripe/cancel`,
            metadata: {
                serviceId, cityId, customerName, customerEmail, customerPhone,
                streetName, houseNumber, propertySize, doorbellName,
                bookingDate, bookingTime, hours, cleaners,
                totalAmount, notes, additionalServices, supplies
            },
            customer_email: customerEmail,
        });

        res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
};

module.exports = { getStripeConfig, createPaymentIntent, capturePayment, createCheckoutSession };
