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

    // ლოგიკა: თუ amount არის მაგალითად 37.80, გადაგვაქვს ცენტებში (3780)
    // თუ amount უკვე არის 3780, ვტოვებთ როგორც არის.
    // ევროპაში დასუფთავება 1000 ევროზე (100000 ცენტზე) მეტი იშვიათად ჯდება, 
    // ამიტომ ეს ზღვარი იმუშავებს:
    if (finalAmount < 1000) {
        finalAmount = Math.round(finalAmount * 100);
    } else {
        finalAmount = Math.round(finalAmount);
    }

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