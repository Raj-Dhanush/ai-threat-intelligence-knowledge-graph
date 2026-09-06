const express = require('express');
const router = express.Router();
const { generateSummary } = require('../controllers/aiController');
const protect = require('../middleware/authMiddleware');

// POST /api/ai/summary - Protected by JWT auth middleware
router.post('/summary', protect, generateSummary);

module.exports = router;
