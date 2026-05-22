const mongoose = require('mongoose');

const ALERT_STATUSES = Object.freeze(['open', 'acknowledged', 'reset']);

const ebmAlertSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  queueId: { type: mongoose.Schema.Types.ObjectId, ref: 'EBMSubmissionQueue', required: true, index: true },
  documentType: { type: String, required: true, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  endpoint: { type: String, required: true },
  operationKey: { type: String, default: 'default' },
  attemptsMade: { type: Number, required: true, min: 0 },
  lastErrorMessage: { type: String, default: null },
  lastErrorCode: { type: String, default: null },
  lastHttpStatus: { type: Number, default: null },
  payload: { type: mongoose.Schema.Types.Mixed, default: null },
  abandonedAt: { type: Date, default: Date.now, index: true },
  acknowledged: { type: Boolean, default: false, index: true },
  acknowledgedAt: { type: Date, default: null },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resetAt: { type: Date, default: null },
  resetBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ALERT_STATUSES, default: 'open', index: true },
}, { timestamps: true });

ebmAlertSchema.index({ companyId: 1, acknowledged: 1, abandonedAt: -1 });
ebmAlertSchema.index({ queueId: 1, status: 1 });

module.exports = mongoose.model('EBMAlert', ebmAlertSchema);
module.exports.ALERT_STATUSES = ALERT_STATUSES;
