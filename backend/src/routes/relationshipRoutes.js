const express = require('express');
const router = express.Router();
const { generateRelationships, getRelationships } = require('../controllers/relationshipController');
const protect = require('../middleware/authMiddleware');

// POST /api/relationships/generate/:documentId  — derive & store relationships
router.post('/generate/:documentId', protect, generateRelationships);

// GET  /api/relationships/:documentId           — fetch stored relationships
router.get('/:documentId', protect, getRelationships);

module.exports = router;
