const express = require('express');
const { getPrediction } = require('../controllers/prediction.controller');

const router = express.Router();

router.get('/:spotId', getPrediction);

module.exports = router;
