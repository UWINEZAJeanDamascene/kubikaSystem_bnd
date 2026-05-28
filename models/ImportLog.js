const mongoose = require('mongoose');

const importLogSchema = new mongoose.Schema({
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
  importedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'completed_with_errors', 'failed'],
    default: 'pending',
    index: true
  },
  totalRows: {
    type: Number,
    default: 0
  },
  successRows: {
    type: Number,
    default: 0
  },
  errorRows: {
    type: Number,
    default: 0
  },
  skippedRows: {
    type: Number,
    default: 0
  },
  templateUsed: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ImportTemplate',
    default: null
  },
  errorReportUrl: {
    type: String,
    default: null
  },
  resultsReportUrl: {
    type: String,
    default: null
  },
  fileName: {
    type: String,
    required: true,
    trim: true
  },
  jobId: {
    type: String,
    default: null,
    index: true
  },
  rowOutcomes: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  errorMessage: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

importLogSchema.index({ companyId: 1, entityType: 1, startedAt: -1 });

module.exports = mongoose.model('ImportLog', importLogSchema);
