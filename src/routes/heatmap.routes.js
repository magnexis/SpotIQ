const express = require('express');
const { getParkingHeatmap } = require('../controllers/heatmap.controller');

const router = express.Router();

router.get('/heatmap', getParkingHeatmap);

module.exports = router;
