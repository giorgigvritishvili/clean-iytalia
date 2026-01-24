const createPaymentIntent = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    const { amount } = req.body;

    // ვალიდაცია
    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    const parsedAmount = Number(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // ევრო → ცენტებში გადაყვანა
    const finalAmount = Math.round(parsedAmount * 100);

    console.log(`Final amount sent to Stripe: ${finalAmount} cents`);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalAmount, // აუცილებლად integer (ცენტები)
      currency: 'eur',
      payment_method_types: ['card'],
      capture_method: 'manual', // ავტორიზაცია, არა ავტომატური ჩამოჭრა
    });

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Stripe Error:', error);
    return res.status(500).json({
      error: 'PaymentIntent creation failed',
    });
  }
};
