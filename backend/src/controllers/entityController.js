const Document = require('../models/Document');
const Entity = require('../models/Entity');

// ── Regex / keyword dictionaries ──────────────────────────────────────────────

const PATTERNS = {
  // Standard CVE format
  CVE: /CVE-\d{4}-\d{4,7}/gi,

  // Country name list (extend as needed)
  Country: /\b(India|USA|United States|China|Russia|Iran|North Korea|Pakistan|Ukraine|Germany|United Kingdom|UK|France|Israel|Brazil)\b/gi,

  // Common malware family names (extend as needed)
  Malware: /\b(WannaCry|NotPetya|Emotet|TrickBot|Ryuk|Cobalt Strike|Mimikatz|BlackMatter|REvil|LockBit|Conti|Stuxnet|Pegasus|DarkSide|Maze|Lazarus|AsyncRAT|RedLine|AgentTesla|Qakbot|IcedID)\b/gi,

  // Known threat actor / APT group names (extend as needed)
  ThreatActor: /\b(APT\d+|Fancy Bear|Cozy Bear|Lazarus Group|Sandworm|Turla|Charming Kitten|Kimsuky|Volt Typhoon|Scattered Spider|UNC\d+|TA\d+|FIN\d+|Carbanak|Gamaredon)\b/gi,
};

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Run all regexes against text, return array of { name, type } objects.
 * Deduplicates by "type::lowercase(name)".
 */
const extractEntities = (text) => {
  const seen = new Set();
  const results = [];

  for (const [type, regex] of Object.entries(PATTERNS)) {
    // Reset lastIndex for global regex between calls
    regex.lastIndex = 0;
    const matches = text.match(regex) || [];

    for (const match of matches) {
      const key = `${type}::${match.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ name: match, type });
      }
    }
  }

  return results;
};

// ── Controller ────────────────────────────────────────────────────────────────

// @desc    Extract entities from a document's text using regex
// @route   POST /api/entities/extract/:documentId
// @access  Private
const extractEntitiesFromDocument = async (req, res) => {
  try {
    const { documentId } = req.params;

    // Fetch the document
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Ensure the requesting user owns the document
    if (document.uploadedBy.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Not authorised to extract from this document' });
    }

    if (!document.extractedText || document.extractedText.trim() === '') {
      return res.status(400).json({ message: 'Document has no extracted text to process' });
    }

    // Run regex extraction
    const rawEntities = extractEntities(document.extractedText);

    if (rawEntities.length === 0) {
      return res.status(200).json({
        message: 'No entities found in document',
        documentId,
        extractedCount: 0,
        entities: [],
      });
    }

    // Delete previous extractions for this document before re-inserting
    await Entity.deleteMany({ documentId });

    // Bulk insert
    const payload = rawEntities.map((e) => ({ ...e, documentId }));
    const inserted = await Entity.insertMany(payload);

    res.status(201).json({
      message: 'Entities extracted successfully',
      documentId,
      extractedCount: inserted.length,
      entities: inserted.map((e) => ({
        id: e._id,
        name: e.name,
        type: e.type,
        createdAt: e.createdAt,
      })),
    });
  } catch (error) {
    console.error('Entity extraction error:', error.message);
    res.status(500).json({ message: 'Server error during entity extraction' });
  }
};

// @desc    Get all entities for a document
// @route   GET /api/entities/:documentId
// @access  Private
const getEntitiesByDocument = async (req, res) => {
  try {
    const { documentId } = req.params;

    const entities = await Entity.find({ documentId }).sort({ type: 1, name: 1 }).select('-__v');

    res.status(200).json({
      documentId,
      count: entities.length,
      entities,
    });
  } catch (error) {
    console.error('Get entities error:', error.message);
    res.status(500).json({ message: 'Server error fetching entities' });
  }
};

module.exports = { extractEntitiesFromDocument, getEntitiesByDocument };
