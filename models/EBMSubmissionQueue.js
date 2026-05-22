const mongoose = require('mongoose');

const DOCUMENT_TYPES = Object.freeze([
  'invoice',
  'pos',
  'creditNote',
  'purchase',
  'stockMovement',
  'stockMaster',
  'branchTransfer',
  'stockAdjustment',
]);

const QUEUE_STATUSES = Object.freeze(['pending', 'failed', 'submitted', 'abandoned']);

const ebmSubmissionQueueSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  documentType: { type: String, enum: DOCUMENT_TYPES, required: true, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  endpoint: { type: String, required: true, trim: true, index: true },
  operationKey: { type: String, default: 'default', trim: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  ebmStatus: { type: String, enum: QUEUE_STATUSES, default: 'pending', index: true },
  retryCount: { type: Number, default: 0, min: 0 },
  maxRetries: { type: Number, default: () => Number(process.env.EBM_MAX_RETRIES || 5), min: 1 },
  nextRetryAt: { type: Date, default: Date.now, index: true },
  lastAttemptAt: { type: Date, default: null },
  lastError: {
    message: { type: String, default: null },
    code: { type: String, default: null },
    status: { type: Number, default: null },
    response: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  attempts: [{
    attemptNumber: { type: Number, required: true },
    attemptedAt: { type: Date, default: Date.now },
    errorCode: { type: String, default: null },
    errorMessage: { type: String, default: null },
    httpStatus: { type: Number, default: null },
    isRetryable: { type: Boolean, default: true },
  }],
  isRetryable: { type: Boolean, default: true, index: true },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true });

ebmSubmissionQueueSchema.index(
  { companyId: 1, documentType: 1, documentId: 1, endpoint: 1, operationKey: 1 },
  { unique: true },
);
ebmSubmissionQueueSchema.index({ ebmStatus: 1, isRetryable: 1, nextRetryAt: 1 });

module.exports = mongoose.model('EBMSubmissionQueue', ebmSubmissionQueueSchema);
module.exports.DOCUMENT_TYPES = DOCUMENT_TYPES;
module.exports.QUEUE_STATUSES = QUEUE_STATUSES;
