const mongoose = require('mongoose');

const ebmTINSchema = new mongoose.Schema({
  tin: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    index: true,
  },
  taxpayerName: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  statusCode: {
    type: String,
    trim: true,
    default: null,
  },
  provinceName: {
    type: String,
    trim: true,
    default: null,
  },
  districtName: {
    type: String,
    trim: true,
    default: null,
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

ebmTINSchema.index({ tin: 1, taxpayerName: 1 });
ebmTINSchema.index({ taxpayerName: 'text', tin: 'text' });

module.exports = mongoose.model('EBMTIN', ebmTINSchema);
