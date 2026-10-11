const Document = require('../models/Document');
const Entity = require('../models/Entity');
const { generateContentWithMeta, parseJsonResponse, getKeyStats } = require('../utils/aiProvider');

const VALID_ENTITY_TYPES = new Set(Entity.ENTITY_TYPES);
const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);
const MAX_EVIDENCE_ITEMS = 6;

/**
 * Text chunker for long threat intelligence documents.
 * Chunks documents with overlap on sentence/paragraph boundaries.
 */
function chunkText(text, maxChunkSize = 10000, overlap = 1000) {
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const chunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + maxChunkSize;

    if (endIndex >= text.length) {
      chunks.push(text.slice(startIndex));
      break;
    }

    // Attempt to break cleanly on a paragraph or sentence boundary
    const sliceToSearch = text.slice(Math.max(startIndex, endIndex - 1000), endIndex + 500);
    const newlinePos = sliceToSearch.lastIndexOf('\n');
    if (newlinePos !== -1) {
      endIndex = Math.max(startIndex, endIndex - 1000) + newlinePos + 1;
    } else {
      const sentencePos = sliceToSearch.lastIndexOf('. ');
      if (sentencePos !== -1) {
        endIndex = Math.max(startIndex, endIndex - 1000) + sentencePos + 2;
      }
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

function cleanArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function entityMergeKey(entity) {
  const names = [entity.name, ...(entity.aliases || [])]
    .map((name) => Entity.normaliseEntityName(name))
    .filter(Boolean)
    .sort();
  return `${entity.type}::${names[0] || Entity.normaliseEntityName(entity.name)}`;
}

function mergeEntityIntoMap(entityMap, entity) {
  const key = entityMergeKey(entity);
  const existingKey = [...entityMap.keys()].find((candidateKey) => {
    const candidate = entityMap.get(candidateKey);
    if (candidate.type !== entity.type) return false;

    const existingNames = new Set(
      [candidate.name, ...(candidate.aliases || [])].map((name) => Entity.normaliseEntityName(name))
    );
    const incomingNames = [entity.name, ...(entity.aliases || [])].map((name) =>
      Entity.normaliseEntityName(name)
    );
    return incomingNames.some((name) => existingNames.has(name));
  });

  if (!existingKey) {
    entityMap.set(key, entity);
    return;
  }

  const existing = entityMap.get(existingKey);
  existing.aliases = cleanArray([...existing.aliases, entity.name, ...entity.aliases]);
  existing.evidence = cleanArray([...existing.evidence, ...entity.evidence]).slice(0, MAX_EVIDENCE_ITEMS);
  existing.description = existing.description || entity.description || '';
  if (existing.confidence !== 'high' && entity.confidence === 'high') {
    existing.confidence = 'high';
  }
}

/**
 * AI-powered entity extraction using Gemini (primary) / Groq (fallback).
 * Processes document chunks, validates evidence against text, and deduplicates.
 *
 * @param {string} fullText - extracted document text
 * @returns {Promise<{ entities: Array, provider: string }>}
 */
async function extractEntitiesViaAI(fullText) {
  const chunks = chunkText(fullText, 12000, 1000);
  const cveRegex = /^CVE-\d{4}-\d{4,7}$/i;
  const merged = new Map();
  let lastProvider = 'gemini';

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    const prompt = `You are a senior cybersecurity threat intelligence analyst.
Read the threat report excerpt and extract cybersecurity knowledge graph entities from the actual context.

Allowed entity types:
- ThreatActor: named intrusion sets, APTs, criminal crews, operators
- Malware: malware families, ransomware, trojans, RATs, implants, payloads
- CVE: CVE identifiers only
- Organization: victim, affected, reporting, or vendor organizations
- Product: affected software, hardware, services, platforms, or cloud products
- IOC: IPs, domains, URLs, hashes, file names, registry paths, mutexes, email addresses
- Technique: MITRE ATT&CK techniques, tactics, behaviors, or intrusion methods
- Campaign: named operations, activity clusters, intrusion campaigns
- Country: countries or regions explicitly involved
- Industry: targeted or affected sectors
- Tool: legitimate or offensive tools used in the activity
- Vulnerability: named vulnerabilities without a CVE
- Infrastructure: C2, botnet, proxy, hosting, or delivery infrastructure
- AttackPattern: higher-level attack chain phases or patterns
- Other: important cyber entity that does not fit the above

Return ONLY a valid JSON array:
[
  {
    "name": "canonical entity name",
    "type": "one allowed type",
    "aliases": ["optional aliases explicitly present in the excerpt"],
    "description": "short context from the excerpt",
    "confidence": "high|medium|low",
    "evidence": ["exact short quote from the excerpt supporting this entity"]
  }
  ...
]

Rules:
- Include entities only when the excerpt itself supports them.
- Evidence must be exact wording copied from the excerpt, not a paraphrase.
- Use aliases only when the alias text is present in the excerpt.
- For CVEs use exact format: CVE-YYYY-NNNNN.
- Do not rely on prior knowledge to add entities.
- Return empty array [] if no entities found

Threat Report Excerpt ${index + 1} of ${chunks.length}:
${chunk}`;

    const aiRes = await generateContentWithMeta(prompt, { maxRetries: 1 });
    lastProvider = aiRes.provider;
    const parsed = parseJsonResponse(aiRes.text);

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (
          item &&
          typeof item.name === 'string' &&
          item.name.trim() &&
          VALID_ENTITY_TYPES.has(item.type)
        ) {
          const cleanName = item.name.trim();
          const evidence = cleanArray(item.evidence).filter((snippet) =>
            evidenceExistsInText(snippet, chunk)
          );

          if (evidence.length === 0) {
            continue;
          }

          if (item.type === 'CVE' && !cveRegex.test(cleanName)) {
            continue;
          }

          mergeEntityIntoMap(merged, {
            name: cleanName,
            type: item.type,
            aliases: cleanArray(item.aliases),
            description: String(item.description || '').trim(),
            confidence: CONFIDENCE_VALUES.has(item.confidence) ? item.confidence : 'medium',
            evidence,
          });
        }
      }
    }
  }

  return { entities: [...merged.values()], provider: lastProvider };
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * @desc    Extract entities from a document's text using AI
 * @route   POST /api/entities/extract/:documentId
 * @access  Private
 */
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

    const keyStats = getKeyStats();
    if (keyStats.gemini === 0 && keyStats.groq === 0) {
      return res.status(503).json({
        message: 'AI extraction requires a configured Gemini or Groq API key. No hardcoded fallback graph was generated.',
      });
    }

    let rawEntities = [];
    let extractionMethod = 'ai';

    try {
      const aiResult = await extractEntitiesViaAI(document.extractedText);
      rawEntities = aiResult.entities;
      extractionMethod = `${aiResult.provider}-ai`;
    } catch (aiErr) {
      console.error(`[EntityController] AI extraction failed: ${aiErr.message}`);
      return res.status(502).json({
        message: 'AI entity extraction failed. No fallback entities were generated because that would create a misleading graph.',
        error: aiErr.message,
      });
    }

    if (rawEntities.length === 0) {
      await Entity.deleteMany({ documentId });
      return res.status(200).json({
        message: 'AI extraction completed but found no evidence-supported entities in this document',
        documentId,
        extractedCount: 0,
        extractionMethod,
        entities: [],
      });
    }

    // Delete previous successful extractions and bulk insert the validated AI output.
    await Entity.deleteMany({ documentId });
    const payload = rawEntities.map((e) => ({
      name: e.name,
      type: e.type,
      aliases: e.aliases || [],
      description: e.description || '',
      confidence: e.confidence || 'medium',
      evidence: e.evidence || [],
      documentId,
    }));
    const inserted = await Entity.insertMany(payload);

    res.status(201).json({
      message: `Entities extracted successfully via ${extractionMethod}`,
      documentId,
      extractedCount: inserted.length,
      extractionMethod,
      entities: inserted.map((e) => ({
        id: e._id,
        name: e.name,
        type: e.type,
        aliases: e.aliases,
        description: e.description,
        confidence: e.confidence,
        evidence: e.evidence,
        createdAt: e.createdAt,
      })),
    });
  } catch (error) {
    console.error('Entity extraction error:', error.message);
    res.status(500).json({ message: 'Server error during entity extraction' });
  }
};

/**
 * @desc    Get all entities for a document
 * @route   GET /api/entities/:documentId
 * @access  Private
 */
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
