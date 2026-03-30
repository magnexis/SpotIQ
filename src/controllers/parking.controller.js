const {
  getNearbyParkingSpots,
  getParkingSpotById,
  getRulesByStreet,
  createError
} = require('../services/parking.service');
const { endParkingSession } = require('../services/session.service');

const parseNumber = (value, fieldName) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw createError(400, `${fieldName} must be a valid number.`);
  }

  return parsed;
};

const getNearbyParking = async (request, response, next) => {
  try {
    const latitude = parseNumber(request.query.lat, 'lat');
    const longitude = parseNumber(request.query.lng, 'lng');
    const radiusKm = request.query.radius
      ? parseNumber(request.query.radius, 'radius')
      : 1.5;
    const page = request.query.page ? parseNumber(request.query.page, 'page') : 1;
    const limit = request.query.limit ? parseNumber(request.query.limit, 'limit') : 10;
    const type = request.query.type;
    const minPrice = request.query.minPrice
      ? parseNumber(request.query.minPrice, 'minPrice')
      : undefined;
    const maxPrice = request.query.maxPrice
      ? parseNumber(request.query.maxPrice, 'maxPrice')
      : undefined;

    if (radiusKm <= 0) {
      throw createError(400, 'radius must be greater than 0.');
    }

    if (page <= 0 || limit <= 0) {
      throw createError(400, 'page and limit must be greater than 0.');
    }

    if (type && !['street', 'garage', 'private'].includes(type)) {
      throw createError(400, 'type must be one of street, garage, or private.');
    }

    const nearbySpots = await getNearbyParkingSpots({
      latitude,
      longitude,
      radiusKm,
      type,
      minPrice,
      maxPrice,
      page,
      limit
    });

    response.status(200).json(nearbySpots);
  } catch (error) {
    next(error);
  }
};

const getParkingSpot = async (request, response, next) => {
  try {
    const spotId = parseNumber(request.params.id, 'id');
    const spot = await getParkingSpotById(spotId);

    response.status(200).json(spot);
  } catch (error) {
    next(error);
  }
};

const getParkingRules = async (request, response, next) => {
  try {
    const rules = await getRulesByStreet(request.params.street);

    response.status(200).json(rules);
  } catch (error) {
    next(error);
  }
};

const completeParkingSession = async (request, response, next) => {
  try {
    const sessionId = parseNumber(request.body.sessionId, 'sessionId');

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw createError(400, 'sessionId must be a positive integer.');
    }

    const session = await endParkingSession(sessionId);

    response.status(200).json(session);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNearbyParking,
  getParkingSpot,
  getParkingRules,
  completeParkingSession
};
