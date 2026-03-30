const express = require('express');
const {
  getNearbyParking,
  getParkingSpot,
  getParkingRules,
  completeParkingSession
} = require('../controllers/parking.controller');

const router = express.Router();

router.get('/nearby', getNearbyParking);
router.post('/end-session', completeParkingSession);
router.get('/rules/:street', getParkingRules);
router.get('/:id', getParkingSpot);

module.exports = router;
