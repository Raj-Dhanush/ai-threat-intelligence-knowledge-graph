const mongoose = require('mongoose');

const ENTITY_TYPES = [
  'ThreatActor',
  'Malware',
  'CVE',
  'Organization',
  'Product',
  'IOC',
  'Technique',
  'Campaign',
  'Country',
  'Industry',
  'Tool',
  'Vulnerability',
  'Infrastructure',
  'AttackPattern',
  'Other',
];

function normaliseEntityName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const entitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Entity name is required'],
      trim: true,
    },
    normalizedName: {
      type: String,
      trim: true,
      lowercase: true,
    },
    type: {
      type: String,
      enum: ENTITY_TYPES,
      required: [true, 'Entity type is required'],
    },
    aliases: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    confidence: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
    },
    evidence: {
      type: [String],
      default: [],
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

entitySchema.pre('validate', function setNormalisedName(next) {
  this.normalizedName = normaliseEntityName(this.name);
  this.aliases = [...new Set((this.aliases || []).map((a) => String(a).trim()).filter(Boolean))];
  this.evidence = [...new Set((this.evidence || []).map((e) => String(e).trim()).filter(Boolean))];
  next();
});

entitySchema.index(
  { documentId: 1, type: 1, normalizedName: 1 },
  { unique: true, partialFilterExpression: { normalizedName: { $type: 'string' } } }
);

const Entity = mongoose.model('Entity', entitySchema);
Entity.ENTITY_TYPES = ENTITY_TYPES;
Entity.normaliseEntityName = normaliseEntityName;

module.exports = Entity;
