const Stripe = require('stripe');

let stripeClient;

const getStripeClient = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      maxNetworkRetries: 2
    });
  }

  return stripeClient;
};

const getWebhookSecret = () => {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
  }

  return process.env.STRIPE_WEBHOOK_SECRET;
};

module.exports = {
  getStripeClient,
  getWebhookSecret
};
