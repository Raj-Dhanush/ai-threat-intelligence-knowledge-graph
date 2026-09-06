const Document = require('../models/Document');
const Entity = require('../models/Entity');
const Relationship = require('../models/Relationship');

// ── Relationship rules ────────────────────────────────────────────────────────
//
//  ThreatActor  --exploits-->  CVE
//  ThreatActor  --uses-->      Malware
//  Malware      --targets-->   Country
//
const RULES = [
  { sourceType: 'ThreatActor', relation: 'exploits', targetType: 'CVE' },
  { sourceType: 'ThreatActor', relation: 'uses',     targetType: 'Malware' },
  { sourceType: 'Malware',     relation: 'targets',  targetType: 'Country' },
];

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Apply all rules against a flat list of entities.
 * Returns an array of { sourceEntity, targetEntity, relation, documentId }.
 * Deduplicates by "sourceId::relation::targetId".
 */
const buildRelationships = (entities, documentId) => {
  const seen = new Set();
  const results = [];

  for (const rule of RULES) {
    const sources = entities.filter((e) => e.type === rule.sourceType);
    const targets = entities.filter((e) => e.type === rule.targetType);

    for (const src of sources) {
      for (const tgt of targets) {
        const key = `${src._id}::${rule.relation}::${tgt._id}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            sourceEntity: src._id,
            targetEntity: tgt._id,
            relation: rule.relation,
            documentId,
          });
        }
      }
    }
  }

  return results;
};

// ── Controllers ───────────────────────────────────────────────────────────────

// @desc    Generate relationships from stored entities for a document
// @route   POST /api/relationships/generate/:documentId
// @access  Private
const generateRelationships = async (req, res) => {
  try {
    const { documentId } = req.params;

    // Verify document exists and belongs to the requesting user
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    if (document.uploadedBy.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Not authorised to process this document' });
    }

    // Fetch all entities stored for this document
    const entities = await Entity.find({ documentId });
    if (entities.length === 0) {
      return res.status(400).json({
        message: 'No entities found for this document. Run entity extraction first.',
      });
    }

    // Build relationship payload from rules
    const payload = buildRelationships(entities, documentId);

    if (payload.length === 0) {
      return res.status(200).json({
        message: 'No relationships could be derived from the extracted entities',
        documentId,
        generatedCount: 0,
        relationships: [],
      });
    }

    // Replace previous relationships for this document
    await Relationship.deleteMany({ documentId });
    const inserted = await Relationship.insertMany(payload);

    // Populate entity names for a readable response
    const populated = await Relationship.find({ documentId })
      .populate('sourceEntity', 'name type')
      .populate('targetEntity', 'name type')
      .select('-__v');

    res.status(201).json({
      message: 'Relationships generated successfully',
      documentId,
      generatedCount: inserted.length,
      relationships: populated.map((r) => ({
        id: r._id,
        source: { id: r.sourceEntity._id, name: r.sourceEntity.name, type: r.sourceEntity.type },
        relation: r.relation,
        target: { id: r.targetEntity._id, name: r.targetEntity.name, type: r.targetEntity.type },
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('Generate relationships error:', error.message);
    res.status(500).json({ message: 'Server error during relationship generation' });
  }
};

// @desc    Get all relationships for a document
// @route   GET /api/relationships/:documentId
// @access  Private
const getRelationships = async (req, res) => {
  try {
    const { documentId } = req.params;

    const relationships = await Relationship.find({ documentId })
      .populate('sourceEntity', 'name type')
      .populate('targetEntity', 'name type')
      .sort({ createdAt: -1 })
      .select('-__v');

    res.status(200).json({
      documentId,
      count: relationships.length,
      relationships: relationships.map((r) => ({
        id: r._id,
        source: { id: r.sourceEntity._id, name: r.sourceEntity.name, type: r.sourceEntity.type },
        relation: r.relation,
        target: { id: r.targetEntity._id, name: r.targetEntity.name, type: r.targetEntity.type },
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get relationships error:', error.message);
    res.status(500).json({ message: 'Server error fetching relationships' });
  }
};

module.exports = { generateRelationships, getRelationships };
