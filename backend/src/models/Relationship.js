const mongoose = require('mongoose');

const RELATION_TYPES = ['exploits', 'uses', 'targets'];

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
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
  }
);

module.exports = mongoose.model('Relationship', relationshipSchema);
