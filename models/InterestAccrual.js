const mongoose = require("mongoose");

const interestAccrualSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    bankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankAccount",
      default: null,
    },
    fixedDeposit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FixedDeposit",
      default: null,
    },
    period: {
      month: { type: Number, required: true, min: 1, max: 12 },
      year: { type: Number, required: true },
    },
    principal: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: function (value) {
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    rate: {
      type: Number,
      required: true,
    },
    daysInPeriod: {
      type: Number,
      default: 0,
    },
    calculatedInterest: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: function (value) {
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    method: {
      type: String,
      enum: ["simple", "compound_monthly", "compound_quarterly", "daily_average"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "posted", "confirmed", "reversed"],
      default: "pending",
    },
    // Two-step posting
    accrualJournalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
    receiptJournalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
    // For single-step posting
    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
    source: {
      type: String,
      enum: ["auto", "manual"],
      default: "auto",
    },
    sourceTag: {
      type: String,
      default: "interest_income_auto",
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: null,
    },
    withholdingTax: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      get: function (value) {
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    grossInterest: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      get: function (value) {
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate accruals for same period and same account
interestAccrualSchema.index(
  { company: 1, bankAccount: 1, "period.month": 1, "period.year": 1 },
  { unique: true, partialFilterExpression: { bankAccount: { $ne: null } } }
);
interestAccrualSchema.index(
  { company: 1, fixedDeposit: 1, "period.month": 1, "period.year": 1 },
  { unique: true, partialFilterExpression: { fixedDeposit: { $ne: null } } }
);

interestAccrualSchema.set("toJSON", {
  transform: function (doc, ret) {
    if (ret.principal && ret.principal.$numberDecimal) {
      ret.principal = parseFloat(ret.principal.$numberDecimal);
    }
    if (ret.calculatedInterest && ret.calculatedInterest.$numberDecimal) {
      ret.calculatedInterest = parseFloat(ret.calculatedInterest.$numberDecimal);
    }
    if (ret.withholdingTax && ret.withholdingTax.$numberDecimal) {
      ret.withholdingTax = parseFloat(ret.withholdingTax.$numberDecimal);
    }
    if (ret.grossInterest && ret.grossInterest.$numberDecimal) {
      ret.grossInterest = parseFloat(ret.grossInterest.$numberDecimal);
    }
    return ret;
  },
});

module.exports = mongoose.model("InterestAccrual", interestAccrualSchema);
