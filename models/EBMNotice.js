const mongoose = require('mongoose');

const ebmNoticeSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  noticeNumber: {
    type: String,
    required: true,
    trim: true,
  },
  title: {
    type: String,
    trim: true,
    default: null,
  },
  content: {
    type: String,
    trim: true,
    default: null,
  },
  noticeDate: {
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

ebmNoticeSchema.index({ company: 1, noticeNumber: 1 }, { unique: true });
ebmNoticeSchema.index({ company: 1, noticeDate: -1 });

module.exports = mongoose.model('EBMNotice', ebmNoticeSchema);
