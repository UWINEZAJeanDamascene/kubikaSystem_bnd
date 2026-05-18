const mongoose = require('mongoose');

const timesheetLineSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  hoursWorked: {
    type: Number,
    required: true,
    min: 0,
    max: 24
  },
  activityType: {
    type: String,
    enum: [
      'production',
      'assembly',
      'quality_control',
      'packing_warehouse',
      'administration',
      'sales_support',
      'other'
    ],
    required: true
  },
  jobRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    default: null
  },
  notes: {
    type: String,
    trim: true,
    default: null
  }
}, { _id: true });

const timesheetSchema = new mongoose.Schema({
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
  // Denormalized snapshot
  employeeName: {
    type: String,
    required: true
  },
  period: {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    monthName: String
  },
  lines: [timesheetLineSchema],
  // Calculated fields (set on approval)
  totalHours: {
    type: Number,
    default: 0
  },
  directHours: {
    type: Number,
    default: 0
  },
  indirectHours: {
    type: Number,
    default: 0
  },
  directPercentage: {
    type: Number,
    default: 0
  },
  indirectPercentage: {
    type: Number,
    default: 0
  },
  // Workflow
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'rejected'],
    default: 'draft'
  },
  submittedAt: {
    type: Date,
    default: null
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    trim: true,
    default: null
  },
  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound index: one timesheet per employee per month
timesheetSchema.index({ company: 1, employee: 1, 'period.month': 1, 'period.year': 1 }, { unique: true });

// Pre-save hook: calculate totals
timesheetSchema.pre('save', function(next) {
  const directTypes = ['production', 'assembly', 'quality_control', 'packing_warehouse'];
  const indirectTypes = ['administration', 'sales_support', 'other'];

  let total = 0;
  let direct = 0;
  let indirect = 0;

  for (const line of this.lines || []) {
    const hrs = Number(line.hoursWorked) || 0;
    total += hrs;
    if (directTypes.includes(line.activityType)) {
      direct += hrs;
    } else if (indirectTypes.includes(line.activityType)) {
      indirect += hrs;
    }
  }

  this.totalHours = Math.round(total * 100) / 100;
  this.directHours = Math.round(direct * 100) / 100;
  this.indirectHours = Math.round(indirect * 100) / 100;

  if (total > 0) {
    this.directPercentage = Math.round((direct / total) * 10000) / 100;
    this.indirectPercentage = Math.round(((total - direct) / total) * 10000) / 100;
  } else {
    this.directPercentage = 0;
    this.indirectPercentage = 0;
  }

  next();
});

module.exports = mongoose.model('Timesheet', timesheetSchema);
