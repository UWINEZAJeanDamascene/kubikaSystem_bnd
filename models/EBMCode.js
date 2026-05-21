const mongoose = require('mongoose');

const ebmCodeSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  codeClass: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  codeClassName: {
    type: String,
    trim: true,
    default: null,
  },
  code: {
    type: String,
    required: true,
    trim: true,
  },
  name: {
    type: String,
    trim: true,
    default: null,
  },
  description: {
    type: String,
    trim: true,
    default: null,
  },
  sortOrder: {
    type: Number,
    default: 0,
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  source: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  lastSyncedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
}, { timestamps: true });

ebmCodeSchema.index({ company: 1, codeClass: 1, code: 1 }, { unique: true });
ebmCodeSchema.index({ company: 1, codeClass: 1, active: 1 });

module.exports = mongoose.model('EBMCode', ebmCodeSchema);
