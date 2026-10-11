const Document = require('../models/Document');
const Entity = require('../models/Entity');
const Relationship = require('../models/Relationship');
const { generateContentWithMeta, parseJsonResponse, getKeyStats } = require('../utils/aiProvider');

const VALID_RELATIONS = new Set(Relationship.RELATION_TYPES);
const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);

function chunkText(text, maxChunkSize = 12000, overlap = 1000) {
  if (!text || text.length <= maxChunkSize) return [text || ''];

  const chunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + maxChunkSize;
    if (endIndex >= text.length) {
      chunks.push(text.slice(startIndex));
      break;
    }

    const searchStart = Math.max(startIndex, endIndex - 1000);
    const sliceToSearch = text.slice(searchStart, endIndex + 500);
    const newlinePos = sliceToSearch.lastIndexOf('\n');
    const sentencePos = sliceToSearch.lastIndexOf('. ');

    if (newlinePos !== -1) {
      endIndex = searchStart + newlinePos + 1;
    } else if (sentencePos !== -1) {
      endIndex = searchStart + sentencePos + 2;
    }

    chunks.push(text.slice(startIndex, endIndex));
    startIndex = Math.max(startIndex + 1, endIndex - overlap);
  }

  return chunks;
}

function normaliseText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function evidenceExistsInText(evidence, text) {
  const cleanEvidence = normaliseText(evidence);
  if (!cleanEvidence || cleanEvidence.length < 8) return false;
  return normaliseText(text).includes(cleanEvidence);
}

function entityMentionedInEvidence(entity, evidence) {
  const cleanEvidence = normaliseText(evidence);
  return [entity.name, ...(entity.aliases || [])]
    .map((name) => normaliseText(name))
    .filter(Boolean)
    .some((name) => cleanEvidence.includes(name));
}

/**
 * AI-powered relationship generation using Gemini (primary) / Groq (fallback).
 * Returns relationships grounded with evidence in the document text.
 *
 * @param {Entity[]} entities - Mongoose entity documents
 * @param {string} docText    - Extracted text from the document
 * @param {string} documentId
 * @returns {Promise<{ relationships: Array, provider: string }>}
 */
async function buildRelationshipsViaAI(entities, docText, documentId) {
  const entityList = entities.map((e) => ({
    id: e._id.toString(),
    name: e.name,
    type: e.type,
    aliases: e.aliases || [],
  }));

  const entityMap = {};
  for (const e of entities) {
    entityMap[e._id.toString()] = e;
  }

  const chunks = chunkText(docText, 12000, 1000);
  const seen = new Set();
  const results = [];
  let lastProvider = 'gemini';

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    const prompt = `You are a senior cybersecurity threat intelligence analyst building an evidence-grounded knowledge graph.

ENTITIES extracted from the threat report:
${JSON.stringify(entityList, null, 2)}

Allowed relationship labels:
${[...VALID_RELATIONS].map((relation) => `- ${relation}`).join('\n')}

Return ONLY a JSON array of directed relationships supported by direct evidence in the excerpt.
Each object must use the EXACT entity IDs from the list above.

[
  {
    "sourceId": "<exact id from list>",
    "relation": "<one allowed label>",
    "targetId": "<exact id from list>",
    "evidence": "<exact short quote from the excerpt supporting the source, relation, and target>",
    "confidence": "high|medium|low"
  }
  ...
]

Rules:
- Include only relationships explicitly stated in this excerpt.
- Preserve direction from the statement. For example, if the report says malware targets an organization, malware is source and organization is target.
- Evidence must be exact wording copied from the excerpt and must mention or clearly identify both entities.
- Do not infer broad associations merely because entities appear in the same report.
- Return [] if no relationships are evident.

Threat Report Excerpt ${index + 1} of ${chunks.length}:
${chunk}`;

    const aiRes = await generateContentWithMeta(prompt, { maxRetries: 1 });
    lastProvider = aiRes.provider;
    const parsed = parseJsonResponse(aiRes.text);

    if (!Array.isArray(parsed)) {
      throw new Error('AI response was not a JSON array');
    }

    for (const item of parsed) {
      if (!item || typeof item.sourceId !== 'string' || typeof item.targetId !== 'string') continue;
      if (!VALID_RELATIONS.has(item.relation)) continue;

      const srcEntity = entityMap[item.sourceId];
      const tgtEntity = entityMap[item.targetId];
      const evidence = String(item.evidence || '').trim();

      if (!srcEntity || !tgtEntity || item.sourceId === item.targetId) continue;
      if (!evidenceExistsInText(evidence, chunk)) continue;
      if (!entityMentionedInEvidence(srcEntity, evidence)) continue;
      if (!entityMentionedInEvidence(tgtEntity, evidence)) continue;

      const key = `${item.sourceId}::${item.relation}::${item.targetId}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          sourceEntity: srcEntity._id,
          targetEntity: tgtEntity._id,
          relation: item.relation,
          evidence,
          confidence: CONFIDENCE_VALUES.has(item.confidence) ? item.confidence : 'medium',
          documentId,
        });
      }
    }
  }

  return { relationships: results, provider: lastProvider };
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * @desc    Generate relationships from stored entities using AI
 * @route   POST /api/relationships/generate/:documentId
 * @access  Private
 */
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

    const keyStats = getKeyStats();
    if (keyStats.gemini === 0 && keyStats.groq === 0) {
      return res.status(503).json({
        message: 'AI relationship extraction requires a configured Gemini or Groq API key. No hardcoded fallback graph was generated.',
      });
    }

    let payload = [];
    let generationMethod = 'ai';

    try {
      const aiResult = await buildRelationshipsViaAI(entities, document.extractedText || '', documentId);
      payload = aiResult.relationships;
      generationMethod = `${aiResult.provider}-ai`;
    } catch (aiErr) {
      console.error(`[RelController] AI relationship generation failed: ${aiErr.message}`);
      return res.status(502).json({
        message: 'AI relationship extraction failed. No rule-based fallback relationships were generated because that would create a misleading graph.',
        error: aiErr.message,
      });
    }

    if (payload.length === 0) {
      await Relationship.deleteMany({ documentId });
      return res.status(200).json({
        message: 'AI extraction completed but found no evidence-supported relationships in this document',
        documentId,
        generationMethod,
        generatedCount: 0,
        relationships: [],
      });
    }

    // Replace previous successful relationships with validated AI output.
    await Relationship.deleteMany({ documentId });
    await Relationship.insertMany(payload);

    // Populate for readable response
    const populated = await Relationship.find({ documentId })
      .populate('sourceEntity', 'name type')
      .populate('targetEntity', 'name type')
      .select('-__v');

    res.status(201).json({
      message: `Relationships generated successfully via ${generationMethod}`,
      documentId,
      generationMethod,
      generatedCount: populated.length,
      relationships: populated.map((r) => ({
        id: r._id,
        source: { id: r.sourceEntity._id, name: r.sourceEntity.name, type: r.sourceEntity.type },
        relation: r.relation,
        target: { id: r.targetEntity._id, name: r.targetEntity.name, type: r.targetEntity.type },
        evidence: r.evidence,
        confidence: r.confidence,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('Generate relationships error:', error.message);
    res.status(500).json({ message: 'Server error during relationship generation' });
  }
};

/**
 * @desc    Get all relationships for a document
 * @route   GET /api/relationships/:documentId
 * @access  Private
 */
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
        evidence: r.evidence,
        confidence: r.confidence,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get relationships error:', error.message);
    res.status(500).json({ message: 'Server error fetching relationships' });
  }
};

module.exports = { generateRelationships, getRelationships };
