const express = require('express');
const { createPaymentSession } = require('../controllers/payment.controller');

const router = express.Router();

router.post('/create-session', createPaymentSession);

module.exports = router;
