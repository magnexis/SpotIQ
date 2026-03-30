const { prisma } = require('../config/db');
const { buildBoundingBox, filterSpotsWithinRadius } = require('../utils/geo');

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const serializePrediction = (prediction) => ({
  id: prediction.id,
  spotId: prediction.spotId,
  predictedAvailability: prediction.predictedAvailability,
  confidence: Number(prediction.confidence),
  timestamp: prediction.timestamp
});

const serializeParkingSession = (session) => ({
  id: session.id,
  spotId: session.spotId,
  amountPaid: Number(session.amountPaid),
  status: session.status,
  stripeSessionId: session.stripeSessionId,
  startTime: session.startTime,
  endTime: session.endTime,
  expiresAt: session.expiresAt,
  createdAt: session.createdAt
});

const isSessionBlocking = (session, now = new Date()) =>
  session.status === 'active' ||
  (session.status === 'pending' && new Date(session.expiresAt).getTime() > now.getTime());

const getSessionPriority = (session, now = new Date()) => {
  if (!isSessionBlocking(session, now)) {
    return 0;
  }

  return session.status === 'active' ? 2 : 1;
};

const getBlockingSessionForSpot = (sessions = [], now = new Date()) =>
  sessions.reduce((selected, session) => {
    if (!selected) {
      return isSessionBlocking(session, now) ? session : null;
    }

    return getSessionPriority(session, now) > getSessionPriority(selected, now)
      ? session
      : selected;
  }, null);

const buildBlockingSessionWhere = (now = new Date()) => ({
  OR: [
    {
      status: 'active'
    },
    {
      status: 'pending',
      expiresAt: {
        gt: now
      }
    }
  ]
});

const deriveAvailabilityStatus = (spot, blockingSession) => {
  if (blockingSession?.status === 'pending') {
    return 'reserved';
  }

  if (blockingSession?.status === 'active' || !spot.isAvailable) {
    return 'occupied';
  }

  return 'available';
};

const serializeParkingSpot = (spot, options = {}) => {
  const now = options.now || new Date();
  const blockingSession =
    options.blockingSession !== undefined
      ? options.blockingSession
      : getBlockingSessionForSpot(spot.sessions || [], now);
  const effectiveAvailability = spot.isAvailable && !blockingSession;

  return {
    id: spot.id,
    latitude: spot.latitude,
    longitude: spot.longitude,
    isAvailable: effectiveAvailability,
    availabilityStatus: deriveAvailabilityStatus(spot, blockingSession),
    type: spot.type,
    pricePerHour: Number(spot.pricePerHour),
    streetName: spot.streetName,
    updatedAt: spot.updatedAt,
    ...(spot.distanceKm !== undefined ? { distanceKm: spot.distanceKm } : {})
  };
};

const getNearbyParkingSpots = async ({
  latitude,
  longitude,
  radiusKm,
  type,
  minPrice,
  maxPrice,
  page,
  limit
}) => {
  const { minLat, maxLat, minLng, maxLng } = buildBoundingBox(latitude, longitude, radiusKm);

  const where = {
    latitude: {
      gte: minLat,
      lte: maxLat
    },
    longitude: {
      gte: minLng,
      lte: maxLng
    }
  };

  if (type) {
    where.type = type;
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.pricePerHour = {};

    if (minPrice !== undefined) {
      where.pricePerHour.gte = minPrice;
    }

    if (maxPrice !== undefined) {
      where.pricePerHour.lte = maxPrice;
    }
  }

  const candidateSpots = await prisma.parkingSpot.findMany({
    where,
    orderBy: {
      updatedAt: 'desc'
    }
  });

  const inRadius = filterSpotsWithinRadius(candidateSpots, latitude, longitude, radiusKm);
  const total = inRadius.length;
  const start = (page - 1) * limit;
  const end = start + limit;
  const paginated = inRadius.slice(start, end);
  const paginatedSpotIds = paginated.map((spot) => spot.id);

  const streetNames = [...new Set(paginated.map((spot) => spot.streetName))];
  const [rules, blockingSessions] = await Promise.all([
    streetNames.length
      ? prisma.parkingRule.findMany({
          where: {
            streetName: {
              in: streetNames
            }
          }
        })
      : [],
    paginatedSpotIds.length
      ? prisma.parkingSession.findMany({
          where: {
            spotId: {
              in: paginatedSpotIds
            },
            ...buildBlockingSessionWhere(new Date())
          },
          orderBy: {
            createdAt: 'desc'
          }
        })
      : []
  ]);

  const rulesByStreet = rules.reduce((accumulator, rule) => {
    const key = rule.streetName.toLowerCase();

    if (!accumulator[key]) {
      accumulator[key] = [];
    }

    accumulator[key].push({
      id: rule.id,
      restrictionType: rule.restrictionType,
      activeDays: rule.activeDays,
      startTime: rule.startTime,
      endTime: rule.endTime
    });

    return accumulator;
  }, {});

  const blockingSessionsBySpot = blockingSessions.reduce((accumulator, session) => {
    const current = accumulator[session.spotId];

    if (!current || getSessionPriority(session) > getSessionPriority(current)) {
      accumulator[session.spotId] = session;
    }

    return accumulator;
  }, {});

  return {
    meta: {
      total,
      page,
      limit,
      radiusKm
    },
    data: paginated.map((spot) => ({
      ...serializeParkingSpot(spot, {
        blockingSession: blockingSessionsBySpot[spot.id] || null
      }),
      currentSession: blockingSessionsBySpot[spot.id]
        ? serializeParkingSession(blockingSessionsBySpot[spot.id])
        : null,
      rules: rulesByStreet[spot.streetName.toLowerCase()] || []
    }))
  };
};

const getParkingSpotById = async (spotId) => {
  const spot = await prisma.parkingSpot.findUnique({
    where: {
      id: spotId
    },
    include: {
      predictions: {
        orderBy: {
          timestamp: 'desc'
        },
        take: 8
      },
      sessions: {
        orderBy: {
          createdAt: 'desc'
        },
        take: 10
      }
    }
  });

  if (!spot) {
    throw createError(404, 'Parking spot not found.');
  }

  const rules = await prisma.parkingRule.findMany({
    where: {
      streetName: {
        equals: spot.streetName,
        mode: 'insensitive'
      }
    },
    orderBy: {
      restrictionType: 'asc'
    }
  });

  const blockingSession = getBlockingSessionForSpot(spot.sessions);

  return {
    ...serializeParkingSpot(spot, {
      blockingSession
    }),
    currentSession: blockingSession ? serializeParkingSession(blockingSession) : null,
    rules: rules.map((rule) => ({
      id: rule.id,
      streetName: rule.streetName,
      restrictionType: rule.restrictionType,
      activeDays: rule.activeDays,
      startTime: rule.startTime,
      endTime: rule.endTime
    })),
    recentPredictions: spot.predictions.map(serializePrediction),
    recentSessions: spot.sessions.map(serializeParkingSession)
  };
};

const getRulesByStreet = async (streetName) => {
  const rules = await prisma.parkingRule.findMany({
    where: {
      streetName: {
        equals: streetName,
        mode: 'insensitive'
      }
    },
    orderBy: [
      {
        restrictionType: 'asc'
      },
      {
        startTime: 'asc'
      }
    ]
  });

  if (!rules.length) {
    throw createError(404, `No parking rules found for street "${streetName}".`);
  }

  return {
    streetName: rules[0].streetName,
    rules: rules.map((rule) => ({
      id: rule.id,
      restrictionType: rule.restrictionType,
      activeDays: rule.activeDays,
      startTime: rule.startTime,
      endTime: rule.endTime
    }))
  };
};

module.exports = {
  getNearbyParkingSpots,
  getParkingSpotById,
  getRulesByStreet,
  serializeParkingSpot,
  serializeParkingSession,
  serializePrediction,
  createError,
  isSessionBlocking,
  getBlockingSessionForSpot,
  buildBlockingSessionWhere
};
