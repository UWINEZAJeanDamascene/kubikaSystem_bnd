const mongoose = require('mongoose');

const amortizationSchema = new mongoose.Schema({
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

const prepaidExpenseSchema = new mongoose.Schema({
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
  vendor: {
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
  expenseAccountCode: {
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
    enum: ['active', 'fully_amortized', 'cancelled'],
    default: 'active'
  },
  journalEntryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JournalEntry',
    default: null
  },
  amortizations: [amortizationSchema],
  remainingBalance: {
    type: Number,
    default: 0
  },
  totalAmortized: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for unique reference per company
prepaidExpenseSchema.index({ company: 1, referenceNo: 1 }, { unique: true });

module.exports = mongoose.model('PrepaidExpense', prepaidExpenseSchema);
