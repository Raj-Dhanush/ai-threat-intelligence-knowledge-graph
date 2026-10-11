const mongoose = require('mongoose');

const RELATION_TYPES = [
  'uses',
  'exploits',
  'targets',
  'delivers',
  'affects',
  'attributed_to',
  'associated_with',
  'communicates_with',
  'downloads',
  'drops',
  'impersonates',
  'indicates',
  'mitigates',
  'observed_in',
  'part_of',
  'targets_sector',
  'targets_product',
  'related_to',
];

const relationshipSchema = new mongoose.Schema(
  {
    sourceEntity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: true,
    },
    targetEntity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: true,
    },
    relation: {
      type: String,
      enum: RELATION_TYPES,
      required: true,
    },
    evidence: {
      type: String,
      required: true,
      trim: true,
    },
    confidence: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
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

relationshipSchema.index(
  { documentId: 1, sourceEntity: 1, relation: 1, targetEntity: 1 },
  { unique: true }
);

const Relationship = mongoose.model('Relationship', relationshipSchema);
Relationship.RELATION_TYPES = RELATION_TYPES;

module.exports = Relationship;
