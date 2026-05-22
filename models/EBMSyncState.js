const mongoose = require('mongoose');

const ebmSyncStateSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  branchId: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 2,
  },
  syncType: {
    type: String,
    required: true,
    enum: ['standard_codes', 'item_classes', 'tins', 'branches', 'notices', 'imported_items', 'purchase_sales'],
    index: true,
  },
  lastReqDt: {
    type: String,
    trim: true,
    default: '20000101000000',
  },
  lastSuccessfulSyncAt: {
    type: Date,
    default: null,
    index: true,
  },
  lastAttemptAt: {
    type: Date,
    default: null,
  },
  lastErrorMessage: {
    type: String,
    trim: true,
    default: null,
  },
  mode: {
    type: String,
    enum: ['mock', 'sandbox', 'production'],
    required: true,
    default: 'mock',
  },
  summary: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, { timestamps: true });

ebmSyncStateSchema.index({ company: 1, branchId: 1, syncType: 1, mode: 1 }, { unique: true });
ebmSyncStateSchema.index({ company: 1, syncType: 1 });

module.exports = mongoose.model('EBMSyncState', ebmSyncStateSchema);
