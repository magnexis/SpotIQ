const { prisma } = require('../config/db');
const { createError } = require('./parking.service');

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

const getCircularHourDistance = (leftHour, rightHour) => {
  const absoluteDifference = Math.abs(leftHour - rightHour);
  return Math.min(absoluteDifference, 24 - absoluteDifference);
};

const getBaselineAvailabilityProbability = (type, at = new Date()) => {
  const hour = at.getHours();
  const isWeekend = [0, 6].includes(at.getDay());
  let baseline;

  switch (type) {
    case 'street':
      if (hour < 6) baseline = 0.9;
      else if (hour < 9) baseline = 0.32;
      else if (hour < 12) baseline = 0.48;
      else if (hour < 16) baseline = 0.38;
      else if (hour < 19) baseline = 0.26;
      else if (hour < 22) baseline = 0.52;
      else baseline = 0.74;
      if (isWeekend) baseline += 0.12;
      break;
    case 'garage':
      if (hour < 7) baseline = 0.82;
      else if (hour < 10) baseline = 0.41;
      else if (hour < 16) baseline = 0.57;
      else if (hour < 20) baseline = 0.46;
      else baseline = 0.7;
      if (isWeekend) baseline += 0.08;
      break;
    case 'private':
      if (hour < 7) baseline = 0.18;
      else if (hour < 18) baseline = 0.62;
      else if (hour < 22) baseline = 0.34;
      else baseline = 0.22;
      if (isWeekend) baseline -= 0.08;
      break;
    default:
      baseline = 0.5;
  }

  return clamp(baseline, 0.05, 0.95);
};

const getHistoricalAvailability = (history, at, fallback) => {
  if (!history.length) {
    return fallback;
  }

  const hour = at.getHours();
  const isWeekend = [0, 6].includes(at.getDay());
  const aligned = history.filter((record) => {
    const recordHour = new Date(record.timestamp).getHours();
    const recordIsWeekend = [0, 6].includes(new Date(record.timestamp).getDay());

    return getCircularHourDistance(recordHour, hour) <= 1 && recordIsWeekend === isWeekend;
  });

  const source = aligned.length ? aligned : history.slice(0, 24);

  const average =
    source.reduce(
      (sum, record) => sum + (record.predictedAvailability ? 1 : 0),
      0
    ) / source.length;

  return clamp(average, 0.05, 0.95);
};

const getRecentTrend = (history, fallback) => {
  if (!history.length) {
    return fallback;
  }

  const recent = history.slice(0, 6);
  const weightedTotal = recent.reduce((sum, record, index) => {
    const weight = recent.length - index;
    return sum + weight * (record.predictedAvailability ? 1 : 0);
  }, 0);
  const totalWeight = recent.reduce((sum, _, index) => sum + (recent.length - index), 0);

  return clamp(weightedTotal / totalWeight, 0.05, 0.95);
};

const shouldPersistPrediction = (latestPrediction, nextPrediction, now) => {
  if (!latestPrediction) {
    return true;
  }

  const latestTimestamp = new Date(latestPrediction.timestamp).getTime();
  const elapsedMinutes = (now.getTime() - latestTimestamp) / (1000 * 60);

  return (
    elapsedMinutes >= 10 ||
    latestPrediction.predictedAvailability !== nextPrediction.predictedAvailability ||
    Math.abs(latestPrediction.confidence - nextPrediction.confidence) >= 0.05
  );
};

const buildPredictionForSpot = async (spotId, options = {}) => {
  const now = options.now ? new Date(options.now) : new Date();
  const spot =
    options.spot ||
    (await prisma.parkingSpot.findUnique({
      where: {
        id: spotId
      }
    }));

  if (!spot) {
    throw createError(404, 'Parking spot not found.');
  }

  const history = await prisma.prediction.findMany({
    where: {
      spotId,
      timestamp: {
        gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
      }
    },
    orderBy: {
      timestamp: 'desc'
    },
    take: 168
  });

  const baseline = getBaselineAvailabilityProbability(spot.type, now);
  const historicalAvailability = getHistoricalAvailability(history, now, baseline);
  const recentTrend = getRecentTrend(history, baseline);
  const liveAdjustment = spot.isAvailable ? 0.08 : -0.08;
  const probability = clamp(
    baseline * 0.45 + historicalAvailability * 0.35 + recentTrend * 0.2 + liveAdjustment,
    0.02,
    0.98
  );
  const predictedAvailability = probability >= 0.5;
  const confidence = clamp(
    0.55 + Math.min(history.length, 60) * 0.005 + Math.abs(probability - 0.5) * 0.4,
    0.5,
    0.97
  );

  const latestPrediction = history[0];
  const predictionRecord = {
    spotId,
    predictedAvailability,
    confidence: Number(confidence.toFixed(2)),
    timestamp: now
  };

  if (options.persist !== false && shouldPersistPrediction(latestPrediction, predictionRecord, now)) {
    await prisma.prediction.create({
      data: predictionRecord
    });
  }

  return {
    spotId,
    streetName: spot.streetName,
    currentAvailability: spot.isAvailable,
    predictedAvailability,
    confidence: Number(confidence.toFixed(2)),
    availabilityScore: Number(probability.toFixed(2)),
    basedOnHistoricalRecords: history.length,
    timestamp: now
  };
};

const getPredictionBySpotId = async (spotId) => {
  return buildPredictionForSpot(spotId, {
    persist: true
  });
};

module.exports = {
  getPredictionBySpotId,
  buildPredictionForSpot,
  getBaselineAvailabilityProbability
};
