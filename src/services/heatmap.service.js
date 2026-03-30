const { prisma } = require('../config/db');
const { calculateDistanceKm } = require('../utils/geo');
const {
  buildBlockingSessionWhere,
  getBlockingSessionForSpot
} = require('./parking.service');

const CLUSTER_RADIUS_KM = 0.4;
const HIGH_AVAILABILITY_INTENSITY = 0.2;
const MEDIUM_AVAILABILITY_INTENSITY = 0.5;
const LOW_AVAILABILITY_INTENSITY = 1.0;

const getEffectiveAvailability = (spot, now = new Date()) => {
  const blockingSession = getBlockingSessionForSpot(spot.sessions || [], now);
  return spot.isAvailable && !blockingSession;
};

const calculateClusterMetrics = (targetSpot, allSpots, now = new Date()) => {
  let nearbyCount = 0;
  let nearbyAvailableCount = 0;

  for (const candidate of allSpots) {
    if (Math.abs(candidate.latitude - targetSpot.latitude) > 0.01) {
      continue;
    }

    if (Math.abs(candidate.longitude - targetSpot.longitude) > 0.01) {
      continue;
    }

    const distanceKm = calculateDistanceKm(
      targetSpot.latitude,
      targetSpot.longitude,
      candidate.latitude,
      candidate.longitude
    );

    if (distanceKm <= CLUSTER_RADIUS_KM) {
      nearbyCount += 1;

      if (getEffectiveAvailability(candidate, now)) {
        nearbyAvailableCount += 1;
      }
    }
  }

  return {
    nearbyCount,
    nearbyAvailableCount,
    availabilityRatio: nearbyCount ? nearbyAvailableCount / nearbyCount : 0
  };
};

const calculateHeatIntensity = (spot, metrics, now = new Date()) => {
  const effectiveAvailability = getEffectiveAvailability(spot, now);
  const densityFactor = Math.min(metrics.nearbyCount / 10, 1);

  if (!effectiveAvailability) {
    if (metrics.availabilityRatio > 0.55 && densityFactor < 0.45) {
      return MEDIUM_AVAILABILITY_INTENSITY;
    }

    return LOW_AVAILABILITY_INTENSITY;
  }

  if (metrics.availabilityRatio >= 0.65 && densityFactor < 0.85) {
    return HIGH_AVAILABILITY_INTENSITY;
  }

  return MEDIUM_AVAILABILITY_INTENSITY;
};

const getHeatmapDataset = async () => {
  const now = new Date();
  const spots = await prisma.parkingSpot.findMany({
    include: {
      sessions: {
        where: buildBlockingSessionWhere(now),
        orderBy: {
          createdAt: 'desc'
        }
      }
    }
  });

  return spots.map((spot) => {
    const metrics = calculateClusterMetrics(spot, spots, now);
    const intensity = calculateHeatIntensity(spot, metrics, now);

    return [spot.latitude, spot.longitude, intensity];
  });
};

module.exports = {
  getHeatmapDataset
};
