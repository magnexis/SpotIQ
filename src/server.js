require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const { registerParkingSocket } = require('./sockets/parking.socket');
const {
  startParkingSimulation,
  stopParkingSimulation
} = require('./services/simulation.service');

const port = Number(process.env.PORT || 3000);
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*'
  }
});

registerParkingSocket(io);

const startServer = async () => {
  await connectDatabase();

  httpServer.listen(port, () => {
    console.log(`Smart Parking API listening on port ${port}`);
    startParkingSimulation();
  });
};

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down Smart Parking API.`);
  stopParkingSimulation();
  io.close();
  httpServer.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
};

process.on('SIGINT', () => {
  shutdown('SIGINT').catch((error) => {
    console.error('Graceful shutdown failed:', error.message);
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch((error) => {
    console.error('Graceful shutdown failed:', error.message);
    process.exit(1);
  });
});

startServer().catch(async (error) => {
  console.error('Failed to start server:', error.message);
  await disconnectDatabase();
  process.exit(1);
});
