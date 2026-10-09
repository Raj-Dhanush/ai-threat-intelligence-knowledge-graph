const express = require('express');
const router = express.Router();
const { chatWithDocument } = require('../controllers/chatController');
const protect = require('../middleware/authMiddleware');

// POST /api/chat - Protected by JWT auth middleware
router.post('/', protect, chatWithDocument);

module.exports = router;
