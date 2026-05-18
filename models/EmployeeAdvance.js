const mongoose = require('mongoose');

const employeeAdvanceSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },

  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },

  referenceNo: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    trim: true,
    default: ''
  },

  amount: {
    type: Number,
    required: true,
    min: 0.01
  },

  amountRepaid: {
    type: Number,
    default: 0,
    min: 0
  },

  balance: {
    type: Number,
    default: function() { return this.amount; },
    min: 0
  },

  issueDate: {
    type: Date,
    required: true,
    default: Date.now
  },

  dueDate: {
    type: Date,
    default: null
  },

  status: {
    type: String,
    enum: ['issued', 'partially_repaid', 'fully_repaid', 'written_off'],
    default: 'issued'
  },

  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'mobile_money', 'cheque'],
    default: 'cash'
  },

  bankAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankAccount',
    default: null
  },

  journalEntryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JournalEntry',
    default: null
  },

  repayments: [{
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true, default: Date.now },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'mobile_money', 'cheque', 'payroll_deduction', 'settlement'],
      required: true
    },
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
      default: null
    },
    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JournalEntry',
      default: null
    },
    notes: { type: String, trim: true, default: '' },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: { type: Date, default: Date.now }
  }],

  notes: {
    type: String,
    trim: true,
    default: ''
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Compound index to ensure unique referenceNo per company
employeeAdvanceSchema.index({ company: 1, referenceNo: 1 }, { unique: true });
employeeAdvanceSchema.index({ company: 1, employee: 1, status: 1 });
employeeAdvanceSchema.index({ company: 1, status: 1, issueDate: -1 });

// Pre-save hook to auto-calculate balance and status
employeeAdvanceSchema.pre('save', function(next) {
  const totalRepaid = (this.repayments || []).reduce((sum, r) => sum + (r.amount || 0), 0);
  this.amountRepaid = totalRepaid;
  this.balance = Math.max(0, (this.amount || 0) - totalRepaid);

  if (this.balance <= 0) {
    this.status = 'fully_repaid';
  } else if (this.amountRepaid > 0) {
    this.status = 'partially_repaid';
  } else {
    this.status = this.status === 'written_off' ? 'written_off' : 'issued';
  }
  next();
});

module.exports = mongoose.model('EmployeeAdvance', employeeAdvanceSchema);
