const express = require('express');
const router = express.Router();
const { extractEntitiesFromDocument, getEntitiesByDocument } = require('../controllers/entityController');
const protect = require('../middleware/authMiddleware');

// POST /api/entities/extract/:documentId  — run regex extraction, store results
router.post('/extract/:documentId', protect, extractEntitiesFromDocument);

// GET  /api/entities/:documentId          — fetch stored entities for a document
router.get('/:documentId', protect, getEntitiesByDocument);

module.exports = router;
