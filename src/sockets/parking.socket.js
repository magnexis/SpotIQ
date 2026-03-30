const { prisma } = require('../config/db');
const { getHeatmapDataset } = require('../services/heatmap.service');

let ioInstance;
let heatmapTimer;

const registerParkingSocket = (io) => {
  ioInstance = io;

  io.on('connection', async (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    try {
      const [totalSpots, availableSpots] = await Promise.all([
        prisma.parkingSpot.count(),
        prisma.parkingSpot.count({
          where: {
            isAvailable: true
          }
        })
      ]);

      socket.emit('parking:connected', {
        message: 'Connected to Smart Parking live updates.',
        totalSpots,
        availableSpots,
        timestamp: new Date()
      });

      const heatmapPoints = await getHeatmapDataset();
      socket.emit('heatmap:update', {
        points: heatmapPoints,
        generatedAt: new Date()
      });
    } catch (error) {
      socket.emit('parking:error', {
        message: 'Unable to load initial parking summary.',
        details: error.message
      });
    }

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};

const emitParkingEvent = (eventName, payload) => {
  if (!ioInstance) {
    return;
  }

  ioInstance.emit(eventName, payload);
};

const scheduleHeatmapBroadcast = (delayMs = 250) => {
  if (!ioInstance) {
    return;
  }

  if (heatmapTimer) {
    clearTimeout(heatmapTimer);
  }

  heatmapTimer = setTimeout(async () => {
    try {
      const points = await getHeatmapDataset();
      ioInstance.emit('heatmap:update', {
        points,
        generatedAt: new Date()
      });
    } catch (error) {
      console.error('Heatmap broadcast failed:', error.message);
    }
  }, delayMs);
};

module.exports = {
  registerParkingSocket,
  emitParkingEvent,
  scheduleHeatmapBroadcast
};
