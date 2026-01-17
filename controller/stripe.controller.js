const createPaymentIntent = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    let { amount } = req.body;

   
    let finalAmount = parseFloat(amount);

    if (!finalAmount || finalAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }


    finalAmount = Math.round(finalAmount * 1);

    console.log(`Final amount sent to Stripe: ${finalAmount} cents`);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalAmount,
      currency: 'eur',
      payment_method_types: ['card'],
      capture_method: 'manual',
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Stripe Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
