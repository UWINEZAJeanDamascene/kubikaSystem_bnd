const mongoose = require('mongoose');

const salarySnapshotSchema = new mongoose.Schema({
  basicSalary: { type: Number, required: true, min: 0 },
  transportAllowance: { type: Number, default: 0 },
  housingAllowance: { type: Number, default: 0 },
  otherAllowances: { type: Number, default: 0 },
  effectiveDate: { type: Date, required: true },
  currency: { type: String, default: 'RWF', uppercase: true, trim: true }
}, { _id: false });

const employeeSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  employeeId: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'terminated'],
    default: 'active'
  },

  // Personal details
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: null
  },
  phone: {
    type: String,
    trim: true,
    default: null
  },
  dateOfBirth: {
    type: Date,
    default: null
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    default: null
  },
  nationalId: {
    type: String,
    trim: true,
    default: null
  },

  // Employment
  hireDate: {
    type: Date,
    default: null
  },
  terminationDate: {
    type: Date,
    default: null
  },
  employmentType: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'intern'],
    default: 'full-time'
  },

  // Organizational
  department: {
    type: String,
    trim: true,
    default: null
  },
  departmentRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null
  },
  position: {
    type: String,
    trim: true,
    default: null
  },
  location: {
    type: String,
    trim: true,
    default: null
  },
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default: null
  },

  // Labor classification (for Direct Labor Auto-Posting)
  laborType: {
    type: String,
    enum: ['direct', 'indirect', 'mixed'],
    default: null
  },
  defaultDirectPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: null
  },
  costCenter: {
    type: String,
    trim: true,
    default: null
  },

  // Bank details
  bankName: {
    type: String,
    trim: true,
    default: null
  },
  bankAccount: {
    type: String,
    trim: true,
    default: null
  },
  bankBranch: {
    type: String,
    trim: true,
    default: null
  },
  mobileMoneyNumber: {
    type: String,
    trim: true,
    default: null
  },

  // Tax & social
  taxStatus: {
    type: String,
    enum: ['resident', 'non-resident'],
    default: 'resident'
  },
  rssbRegistrationNumber: {
    type: String,
    trim: true,
    default: null
  },
  tinNumber: {
    type: String,
    trim: true,
    default: null
  },

  // Current salary (denormalized snapshot for fast access)
  currentSalary: {
    type: salarySnapshotSchema,
    default: null
  },

  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Compound unique index: employeeId per company
employeeSchema.index({ company: 1, employeeId: 1 }, { unique: true });

// Sparse unique index for bankAccount per company (allows multiple nulls)
employeeSchema.index({ company: 1, bankAccount: 1 }, { unique: true, sparse: true });

// Common query indexes
employeeSchema.index({ company: 1, status: 1 });
employeeSchema.index({ company: 1, department: 1 });
employeeSchema.index({ company: 1, employmentType: 1 });

// Pre-save hook: trim and uppercase employeeId
employeeSchema.pre('save', function (next) {
  if (this.isModified('employeeId') && this.employeeId) {
    this.employeeId = this.employeeId.trim().toUpperCase();
  }
  if (this.email) {
    this.email = this.email.trim().toLowerCase();
  }
  next();
});

// Virtual for full name
employeeSchema.virtual('fullName').get(function () {
  return `${this.firstName || ''} ${this.lastName || ''}`.trim();
});

// Virtual for gross salary from currentSalary
employeeSchema.virtual('grossSalary').get(function () {
  if (!this.currentSalary) return 0;
  const s = this.currentSalary;
  return (s.basicSalary || 0) + (s.transportAllowance || 0) + (s.housingAllowance || 0) + (s.otherAllowances || 0);
});

module.exports = mongoose.model('Employee', employeeSchema);
