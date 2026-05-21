const mongoose = require('mongoose');

const ebmItemClassSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  itemClassCode: {
    type: String,
    required: true,
    trim: true,
  },
  itemClassName: {
    type: String,
    required: true,
    trim: true,
  },
  itemClassLevel: {
    type: Number,
    default: null,
  },
  parentCode: {
    type: String,
    trim: true,
    default: null,
    index: true,
  },
  taxTypeCode: {
    type: String,
    trim: true,
    default: null,
  },
  majorTarget: {
    type: Boolean,
    default: false,
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

ebmItemClassSchema.index({ company: 1, itemClassCode: 1 }, { unique: true });
ebmItemClassSchema.index({ company: 1, itemClassName: 1 });

module.exports = mongoose.model('EBMItemClass', ebmItemClassSchema);
