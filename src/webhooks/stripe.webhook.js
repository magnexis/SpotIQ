const { provisionApiKey } = require('../services/apiKey.service');
const { getStripeClient, getWebhookSecret } = require('../config/stripe');
const {
  activateParkingSession,
  expireParkingSession
} = require('../services/session.service');

const handleStripeWebhook = async (request, response, next) => {
  const stripeSignature = request.headers['stripe-signature'];

  if (!stripeSignature) {
    return response.status(400).json({
      error: {
        message: 'Missing Stripe signature header.',
        status: 400
      }
    });
  }

  let event;

  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(
      request.body,
      stripeSignature,
      getWebhookSecret()
    );
  } catch (error) {
    return response.status(400).json({
      error: {
        message: `Webhook signature verification failed: ${error.message}`,
        status: 400
      }
    });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await provisionApiKey(event.data.object); 
        await activateParkingSession(event.data.object);
        break;
      case 'checkout.session.expired':
        await expireParkingSession(event.data.object, 'expired');
        break;
      case 'checkout.session.async_payment_failed':
        await expireParkingSession(event.data.object, 'cancelled');
        break;
      default:
        break;
    }

    response.status(200).json({
      received: true,
      type: event.type
    });
  } catch (error) {
    next(error);
  }
};

module.exports = handleStripeWebhook;
