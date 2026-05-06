const mongoose = require('mongoose');

const loanPaymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'cheque', 'mobile_money'],
  },
  reference: String,
  notes: String,
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Liability Transaction Schema - for tracking drawdowns, repayments, interest charges
const liabilityTransactionSchema = new mongoose.Schema({
  transactionDate: {
    type: Date,
    required: true
  },
  type: {
    type: String,
    enum: ['drawdown', 'repayment', 'interest_charge'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  principalPortion: {
    type: Number,
    default: 0
  },
  interestPortion: {
    type: Number,
    default: 0
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
  notes: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

const loanSchema = new mongoose.Schema({
  // Multi-tenancy: company reference
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Loan must belong to a company']
  },
  loanNumber: {
    type: String,
    uppercase: true
  },
  lenderName: {
    type: String,
    trim: true
  },
  lenderContact: String,
  
  // Liability name/description
  name: {
    type: String,
    required: [true, 'Please provide liability name'],
    trim: true
  },
  
  // Loan/Liability type - expanded to include hire_purchase and accrual
  loanType: {
    type: String,
    enum: ['short-term', 'long-term', 'loan', 'hire_purchase', 'accrual', 'other'],
    required: true
  },
  // Legacy alias for compatibility
  type: {
    type: String,
    enum: ['short-term', 'long-term', 'loan', 'hire_purchase', 'accrual', 'other']
  },
  purpose: {
    type: String,
    trim: true
  },
  
  // Financial amounts
  originalAmount: {
    type: Number,
    required: true,
    min: 0.01
  },
  // Outstanding balance - tracked separately
  outstandingBalance: {
    type: Number,
    required: true,
    default: function() { return this.originalAmount; }
  },
  
  // Interest
  interestRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  // Interest calculation method
  interestMethod: {
    type: String,
    enum: ['simple', 'compound'],
    default: 'simple'
  },
  // Duration in months (drives schedule calculation)
  durationMonths: {
    type: Number,
    min: 1
  },
  
  // Account references for journal entries
  liabilityAccountId: {
    type: mongoose.Schema.Types.Mixed, // Accept both ObjectId and string (account code)
    ref: 'ChartOfAccount',
    required: [true, 'Liability account is required']
  },
  interestExpenseAccountId: {
    type: mongoose.Schema.Types.Mixed,
    ref: 'ChartOfAccount',
    default: null
  },
  
  // Dates
  startDate: {
    type: Date,
    required: true
  },
  endDate: Date,
  
  // Status
  status: {
    type: String,
    enum: ['active', 'paid-off', 'fully_repaid', 'defaulted', 'cancelled'],
    default: 'active'
  },
  
  // Payment tracking
  amountPaid: {
    type: Number,
    default: 0
  },
  payments: [loanPaymentSchema],
  // New: Liability transactions for drawdowns, repayments, interest
  transactions: [liabilityTransactionSchema],
  
  // Terms
  paymentTerms: {
    type: String,
    enum: ['monthly', 'quarterly', 'annually', 'bullet'],
    default: 'monthly'
  },
  monthlyPayment: Number,
  
  // Security/collateral
  collateral: String,
  notes: String,

  // IFRS 7 / IAS 1 Disclosure Requirements
  // Security classification (IFRS 7.33)
  isSecured: {
    type: Boolean,
    default: false
  },
  securityDescription: {
    type: String,
    trim: true
  },

  // Loan classification for disclosure (IFRS 7.33)
  classification: {
    type: String,
    enum: ['bank_loan', 'bond', 'finance_lease', 'related_party', 'other'],
    default: 'bank_loan'
  },

  // Related party details (IAS 24)
  relatedPartyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    default: null
  },
  relatedPartyName: {
    type: String,
    trim: true
  },

  // Currency (IFRS 7.34)
  currencyCode: {
    type: String,
    enum: ['RWF', 'USD', 'EUR', 'GBP', 'UGX', 'KES', 'TZS'],
    default: 'RWF'
  },
  exchangeRate: {
    type: Number,
    default: 1
  },

  // Covenant tracking (IAS 1.74)
  hasCovenants: {
    type: Boolean,
    default: false
  },
  covenantDetails: {
    type: String,
    trim: true
  },
  covenantBreach: {
    type: Boolean,
    default: false
  },
  covenantBreachDate: Date,

  // IFRS 9 - Classification and Measurement
  ifrs9Classification: {
    type: String,
    enum: ['amortized_cost', 'fvoci', 'fvtpl'],
    default: 'amortized_cost',
    description: 'IFRS 9 business model classification'
  },

  // IFRS 9 - Impairment (Expected Credit Loss Model)
  impairmentStage: {
    type: String,
    enum: ['stage_1', 'stage_2', 'stage_3'],
    default: 'stage_1',
    description: 'ECL stage: 1=12-month ECL, 2=lifetime ECL, 3=credit-impaired'
  },
  eclProvision: {
    type: Number,
    default: 0,
    min: 0,
    description: 'Expected Credit Loss provision amount'
  },
  probabilityOfDefault: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
    description: 'Probability of Default (PD) percentage'
  },
  lossGivenDefault: {
    type: Number,
    default: 45,
    min: 0,
    max: 100,
    description: 'Loss Given Default (LGD) percentage'
  },
  exposureAtDefault: {
    type: Number,
    default: 0,
    min: 0,
    description: 'Exposure at Default (EAD)'
  },
  effectiveInterestRate: {
    type: Number,
    default: 0,
    min: 0,
    description: 'Effective Interest Rate (EIR) for amortized cost calculation'
  },
  significantIncreaseInCreditRisk: {
    type: Boolean,
    default: false,
    description: 'SICR flag for Stage 2 migration'
  },
  creditRiskAssessedAt: {
    type: Date,
    description: 'Last date credit risk was assessed'
  },
  daysPastDue: {
    type: Number,
    default: 0,
    min: 0,
    description: 'Days Past Due (DPD) for staging'
  },
  forbearanceStatus: {
    type: String,
    enum: ['none', 'temporary', 'permanent'],
    default: 'none',
    description: 'Forbearance/restructuring status'
  },
  defaultDate: {
    type: Date,
    description: 'Date of default (Stage 3 entry)'
  },
  writeOffAmount: {
    type: Number,
    default: 0,
    min: 0,
    description: 'Amount written off'
  },
  writeOffDate: {
    type: Date,
    description: 'Date of write-off'
  },

  // User tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Compound index for company + unique loan number
loanSchema.index({ company: 1, loanNumber: 1 }, { unique: true });
loanSchema.index({ company: 1 });
loanSchema.index({ company: 1, status: 1 });

// Auto-generate loan number
loanSchema.pre('save', async function(next) {
  if (this.isNew && !this.loanNumber) {
    const count = await mongoose.model('Loan').countDocuments({ company: this.company });
    this.loanNumber = `LN-${String(count + 1).padStart(5, '0')}`;
  }
  // Set outstandingBalance to originalAmount if not set
  if (this.isNew && !this.outstandingBalance) {
    this.outstandingBalance = this.originalAmount;
  }
  next();
});

// Virtual for remaining balance (alias for outstandingBalance)
loanSchema.virtual('remainingBalance').get(function() {
  return this.outstandingBalance || (this.originalAmount - this.amountPaid);
});

// Virtual for next payment due (simplified)
loanSchema.virtual('nextPaymentDue').get(function() {
  if (this.status !== 'active' || !this.startDate) return null;
  // Simplified calculation - in real system would track actual schedule
  const nextDate = new Date(this.startDate);
  const monthsPaid = this.amountPaid / (this.monthlyPayment || 1);
  nextDate.setMonth(nextDate.getMonth() + Math.ceil(monthsPaid) + 1);
  return nextDate;
});

loanSchema.set('toJSON', { virtuals: true });
loanSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Loan', loanSchema);
