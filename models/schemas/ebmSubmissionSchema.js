const mongoose = require('mongoose');

const ebmSubmissionSchema = new mongoose.Schema({
  rcptSign: { type: String, default: null, trim: true },
  intrlData: { type: String, default: null, trim: true },
  rcptNo: { type: String, default: null, trim: true },
  rcptDt: { type: String, default: null, trim: true },
  rcptTyCd: { type: String, default: null, trim: true },
  pmtTyCd: { type: String, default: null, trim: true },
  salesTyCd: { type: String, default: null, trim: true },
  cfmDt: { type: String, default: null, trim: true },
  submittedAt: { type: Date, default: null },
  ebmStatus: {
    type: String,
    enum: ['not_submitted', 'pending', 'submitted', 'failed'],
    default: 'not_submitted',
    index: true,
  },
  retryCount: { type: Number, default: 0, min: 0 },
  lastError: { type: String, default: null, trim: true },
  qrCode: { type: String, default: null, trim: true },
}, { _id: false });

module.exports = ebmSubmissionSchema;
