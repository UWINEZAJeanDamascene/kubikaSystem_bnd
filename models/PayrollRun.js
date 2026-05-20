const mongoose = require('mongoose');

const payrollRunSchema = new mongoose.Schema({
  // Multi-tenancy - company reference
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },

  // Reference number - unique per company
  reference_no: {
    type: String,
    required: true
  },

  // Pay period
  pay_period_start: {
    type: Date,
    required: true
  },
  pay_period_end: {
    type: Date,
    required: true
  },
  payment_date: {
    type: Date,
    required: true
  },

  // Status: draft, posted, reversed
  status: {
    type: String,
    enum: ['draft', 'posted', 'reversed'],
    default: 'draft'
  },

  // Totals
  total_gross: {
    type: Number,
    required: true,
    min: 0
  },
  total_tax: {
    type: Number,
    required: true,
    min: 0
  },
  total_other_deductions: {
    type: Number,
    default: 0
  },
  total_net: {
    type: Number,
    required: true,
    min: 0
  },

  // Account references - required for journal entry
  bank_account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankAccount',
    required: true
  },
  salary_account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChartOfAccount',
    required: true
    // Must be 6100-series Salaries & Wages account
  },
  tax_payable_account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChartOfAccount',
    required: true
    // Must be 2200-series Tax Payable account
  },
  other_deductions_account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChartOfAccount',
    default: null
    // Required only if total_other_deductions > 0
  },

  // Journal entry reference
  journal_entry_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JournalEntry',
    default: null
  },
  reversal_journal_entry_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JournalEntry',
    default: null
  },
  net_pay_journal_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JournalEntry',
    default: null
  },
  paye_remit_journal_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JournalEntry',
    default: null
  },
  rssb_remit_journal_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JournalEntry',
    default: null
  },

  // Notes
  notes: {
    type: String,
    default: null
  },

  // Audit
  posted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Employee lines — Rwanda 2025 detailed breakdown
  lines: [
    {
      employee_name: { type: String, required: true },
      employee_id: { type: String, required: true },
      employee_ref_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
      employee_department: { type: String, default: 'Unassigned' },
      // Income components
      basic_salary: { type: Number, default: 0 },
      transport_allowance: { type: Number, default: 0 },
      housing_allowance: { type: Number, default: 0 },
      other_allowances: { type: Number, default: 0 },
      overtime: { type: Number, default: 0 },
      bonuses: { type: Number, default: 0 },
      commissions: { type: Number, default: 0 },
      benefits_in_kind: { type: Number, default: 0 },
      gross_salary: { type: Number, required: true },
      // PAYE
      tax_deduction: { type: Number, required: true },
      // RSSB Employee deductions
      rssb_employee_pension: { type: Number, default: 0 },
      rssb_employee_maternity: { type: Number, default: 0 },
      rssb_employee_total: { type: Number, default: 0 },
      // RSSB Employer contributions
      rssb_employer_pension: { type: Number, default: 0 },
      rssb_employer_maternity: { type: Number, default: 0 },
      occupational_hazard: { type: Number, default: 0 },
      occupational_hazard_rate: { type: Number, default: 2.0 },
      rssb_employer_total: { type: Number, default: 0 },
      // Other deductions
      health_insurance: { type: Number, default: 0 },
      loan_deductions: { type: Number, default: 0 },
      other_deductions: { type: Number, default: 0 },
      total_deductions: { type: Number, default: 0 },
      net_pay: { type: Number, required: true },
      payroll_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Payroll' },
      // Labor cost allocation (Direct Labor Auto-Posting)
      labor_type: { type: String, enum: ['direct', 'indirect', 'mixed'], default: null },
      direct_amount: { type: Number, default: 0 },
      indirect_amount: { type: Number, default: 0 },
      direct_percentage: { type: Number, default: 0 },
      indirect_percentage: { type: Number, default: 0 },
      allocation_source: { type: String, enum: ['employee_default', 'timesheet', 'department_default', 'manual', 'direct_only', 'indirect_only'], default: null },
      timesheet_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Timesheet', default: null }
    }
  ],

  // Count of employee records
  employee_count: {
    type: Number,
    default: 0
  },

  // ── Remittance tracking (Rwanda RRA / RSSB compliance) ──
  remittance: {
    paye: {
      remitted: { type: Boolean, default: false },
      remitted_date: { type: Date, default: null },
      reference_no: { type: String, default: null },
      amount: { type: Number, default: 0 }
    },
    rssb: {
      remitted: { type: Boolean, default: false },
      remitted_date: { type: Date, default: null },
      reference_no: { type: String, default: null },
      amount: { type: Number, default: 0 }
    }
  },

  // Bank transfer / payment file generation tracking
  bank_transfer: {
    generated: { type: Boolean, default: false },
    generated_at: { type: Date, default: null },
    file_name: { type: String, default: null },
    format: { type: String, enum: ['csv', 'excel', 'xml'], default: 'csv' }
  },

  // Warnings for supervisor review (e.g., timesheet variance)
  warnings: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

// Indexes
payrollRunSchema.index({ company: 1, reference_no: 1 }, { unique: true });
payrollRunSchema.index({ company: 1, payment_date: -1 });
payrollRunSchema.index({ company: 1, status: 1 });

// Prevent duplicate payroll for same period (only for non-reversed)
payrollRunSchema.index(
  { company: 1, pay_period_start: 1, pay_period_end: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $ne: 'reversed' } }
  }
);

// Auto-generate reference number
payrollRunSchema.pre('save', async function(next) {
  if (this.isNew && !this.reference_no) {
    const count = await mongoose.model('PayrollRun').countDocuments({ company: this.company });
    this.reference_no = `PYRL-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('PayrollRun', payrollRunSchema);
