const mongoose = require('mongoose');

const importTemplateSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  entityType: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  columnMapping: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    default: {}
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastUsedAt: {
    type: Date,
    default: null
  },
  useCount: {
    type: Number,
    default: 0,
    min: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: false, updatedAt: true }
});

importTemplateSchema.index({ companyId: 1, entityType: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ImportTemplate', importTemplateSchema);
