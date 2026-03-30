const { getPredictionBySpotId } = require('../services/prediction.service');
const { createError } = require('../services/parking.service');

const getPrediction = async (request, response, next) => {
  try {
    const spotId = Number(request.params.spotId);

    if (!Number.isInteger(spotId) || spotId <= 0) {
      throw createError(400, 'spotId must be a positive integer.');
    }

    const prediction = await getPredictionBySpotId(spotId);

    response.status(200).json(prediction);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPrediction
};
