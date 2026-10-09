const express = require('express');
const router = express.Router();
const { generateSummary } = require('../controllers/aiController');
const { chatWithDocument } = require('../controllers/chatController');
const protect = require('../middleware/authMiddleware');

// POST /api/ai/summary - Protected by JWT auth middleware
router.post('/summary', protect, generateSummary);

// POST /api/ai/chat - Protected by JWT auth middleware
router.post('/chat', protect, chatWithDocument);

module.exports = router;
