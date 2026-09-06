const mongoose = require('mongoose');

const ENTITY_TYPES = ['ThreatActor', 'Malware', 'CVE', 'Country', 'Industry', 'Technique'];

const entitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Entity name is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ENTITY_TYPES,
      required: [true, 'Entity type is required'],
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

module.exports = mongoose.model('Entity', entitySchema);
