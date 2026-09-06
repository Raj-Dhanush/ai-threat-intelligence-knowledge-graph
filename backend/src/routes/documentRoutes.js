const express = require('express');
const router = express.Router();
const { uploadDocument, getDocuments } = require('../controllers/documentController');
const protect = require('../middleware/authMiddleware');

// POST /api/documents/upload  — requires valid JWT
router.post('/upload', protect, uploadDocument);

// GET /api/documents          — requires valid JWT
router.get('/', protect, getDocuments);

module.exports = router;
