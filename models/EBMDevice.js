const mongoose = require('mongoose');

const EBM_DEVICE_STATUSES = Object.freeze({
  NOT_INITIALIZED: 'not_initialized',
  INITIALIZED: 'initialized',
  FAILED: 'failed',
});

const EBM_DEVICE_MODES = Object.freeze({
  MOCK: 'mock',
  SANDBOX: 'sandbox',
  PRODUCTION: 'production',
});

const ebmDeviceSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  tin: {
    type: String,
    required: true,
    trim: true,
  },
  branchId: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 2,
  },
  branchName: {
    type: String,
    trim: true,
    default: null,
  },
  branchRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    default: null,
  },
  deviceSerialNo: {
    type: String,
    required: true,
    trim: true,
    immutable: true,
  },
  status: {
    type: String,
    enum: Object.values(EBM_DEVICE_STATUSES),
    default: EBM_DEVICE_STATUSES.NOT_INITIALIZED,
    index: true,
  },
  initializedAt: {
    type: Date,
    default: null,
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
  initializedMode: {
    type: String,
    enum: Object.values(EBM_DEVICE_MODES),
    default: null,
  },
  lastAttemptMode: {
    type: String,
    enum: Object.values(EBM_DEVICE_MODES),
    default: null,
  },
  initResult: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, {
  timestamps: true,
});

ebmDeviceSchema.index({ company: 1, branchId: 1 });
ebmDeviceSchema.index(
  { company: 1, branchId: 1, deviceSerialNo: 1 },
  { unique: true },
);

module.exports = mongoose.model('EBMDevice', ebmDeviceSchema);
module.exports.EBM_DEVICE_STATUSES = EBM_DEVICE_STATUSES;
module.exports.EBM_DEVICE_MODES = EBM_DEVICE_MODES;
