const mongoose = require('mongoose');

const recognitionSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0.01 },
  date: { type: Date, required: true },
  description: { type: String, trim: true, default: '' },
  journalEntryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JournalEntry',
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'posted', 'reversed'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const deferredRevenueSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  referenceNo: {
    type: String,
    required: true,
    trim: true
  },
  customer: {
    type: String,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0.01
  },
  revenueAccountCode: {
    type: String,
    required: true,
    trim: true
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'mobile_money', 'cheque', 'petty_cash'],
    required: true,
    default: 'cash'
  },
  bankAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankAccount',
    default: null
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  frequency: {
    type: String,
    enum: ['monthly', 'quarterly', 'annually'],
    required: true,
    default: 'monthly'
  },
  status: {
    type: String,
    enum: ['active', 'fully_recognized', 'cancelled'],
    default: 'active'
  },
  remainingBalance: {
    type: Number,
    default: 0
  },
  totalRecognized: {
    type: Number,
    default: 0
  },
  recognitions: [recognitionSchema],
  journalEntryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JournalEntry',
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

deferredRevenueSchema.index({ company: 1, status: 1 });
deferredRevenueSchema.index({ company: 1, referenceNo: 1 });

module.exports = mongoose.model('DeferredRevenue', deferredRevenueSchema);
