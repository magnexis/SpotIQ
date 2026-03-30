require('dotenv').config();

const { io } = require('socket.io-client');

const socket = io(`http://localhost:${process.env.PORT || 3000}`, {
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log(`Connected with socket id ${socket.id}`);
});

socket.on('parking:connected', (payload) => {
  console.log('Initial summary:', payload);
});

socket.on('parking:update', (payload) => {
  console.log('parking:update', payload);
});

socket.on('parking:occupied', (payload) => {
  console.log('parking:occupied', payload);
});

socket.on('parking:available', (payload) => {
  console.log('parking:available', payload);
});

socket.on('heatmap:update', (payload) => {
  console.log('heatmap:update', {
    points: payload.points.length,
    generatedAt: payload.generatedAt
  });
});

socket.on('disconnect', () => {
  console.log('Socket disconnected.');
});
