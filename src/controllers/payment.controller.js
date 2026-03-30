const { createError } = require('../services/parking.service');
const { createCheckoutSession } = require('../services/session.service');

const createPaymentSession = async (request, response, next) => {
  try {
    const spotId = Number(request.body.spotId);

    if (!Number.isInteger(spotId) || spotId <= 0) {
      throw createError(400, 'spotId must be a positive integer.');
    }

    const checkoutSession = await createCheckoutSession({
      spotId
    });

    response.status(201).json(checkoutSession);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPaymentSession
};
