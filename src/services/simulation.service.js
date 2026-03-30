const { prisma } = require('../config/db');
const {
  serializeParkingSpot,
  getBlockingSessionForSpot,
  buildBlockingSessionWhere
} = require('./parking.service');
const {
  buildPredictionForSpot,
  getBaselineAvailabilityProbability
} = require('./prediction.service');
const { emitParkingEvent, scheduleHeatmapBroadcast } = require('../sockets/parking.socket');
const { cleanupExpiredPendingSessions } = require('./session.service');

let simulationTimer;
let simulationInFlight = false;

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

const shuffle = (items) => {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
};

const calculateTargetAvailability = (spot, at) => {
  const baseAvailability = getBaselineAvailabilityProbability(spot.type, at);
  const price = Number(spot.pricePerHour);
  const priceAdjustment = price >= 8 ? 0.1 : price <= 3 ? -0.05 : 0;
  const locationFingerprint = Math.abs(Math.round((spot.latitude + spot.longitude) * 1000)) % 6;
  const locationAdjustment = (locationFingerprint - 3) * 0.015;
  const persistenceAdjustment = spot.isAvailable ? 0.05 : -0.05;

  return clamp(
    baseAvailability + priceAdjustment + locationAdjustment + persistenceAdjustment,
    0.05,
    0.95
  );
};

const runSimulationCycle = async () => {
  await cleanupExpiredPendingSessions();

  const spots = await prisma.parkingSpot.findMany({
    include: {
      sessions: {
        where: buildBlockingSessionWhere(new Date()),
        orderBy: {
          createdAt: 'desc'
        }
      }
    }
  });

  if (!spots.length) {
    return;
  }

  const now = new Date();
  const candidateCount = Math.max(1, Math.ceil(spots.length * 0.18));
  const selectedSpots = shuffle(spots).slice(0, candidateCount);

  for (const spot of selectedSpots) {
    if (getBlockingSessionForSpot(spot.sessions, now)) {
      continue;
    }

    const targetAvailability = calculateTargetAvailability(spot, now);
    const nextAvailability = Math.random() < targetAvailability;

    if (nextAvailability === spot.isAvailable) {
      continue;
    }

    const updatedSpot = await prisma.parkingSpot.update({
      where: {
        id: spot.id
      },
      data: {
        isAvailable: nextAvailability
      }
    });

    const prediction = await buildPredictionForSpot(updatedSpot.id, {
      spot: updatedSpot,
      now,
      persist: true
    });

    const payload = {
      spot: serializeParkingSpot(updatedSpot, {
        blockingSession: null,
        now
      }),
      prediction
    };

    emitParkingEvent('parking:update', payload);
    emitParkingEvent(nextAvailability ? 'parking:available' : 'parking:occupied', payload);
    scheduleHeatmapBroadcast();
  }
};

const startParkingSimulation = () => {
  const intervalMs = Number(process.env.SIMULATION_INTERVAL_MS || 5000);

  if (simulationTimer) {
    clearInterval(simulationTimer);
  }

  simulationTimer = setInterval(() => {
    if (simulationInFlight) {
      return;
    }

    simulationInFlight = true;
    runSimulationCycle().catch((error) => {
      console.error('Simulation cycle failed:', error.message);
    }).finally(() => {
      simulationInFlight = false;
    });
  }, intervalMs);

  return simulationTimer;
};

const stopParkingSimulation = () => {
  if (simulationTimer) {
    clearInterval(simulationTimer);
    simulationTimer = undefined;
  }

  simulationInFlight = false;
};

module.exports = {
  startParkingSimulation,
  stopParkingSimulation
};
