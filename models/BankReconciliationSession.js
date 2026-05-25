const mongoose = require("mongoose");

const bankReconciliationSessionSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankAccount",
      required: true,
      index: true,
    },
    periodStart: {
      type: Date,
      required: true,
      index: true,
    },
    periodEnd: {
      type: Date,
      required: true,
      index: true,
    },
    openingBookBalance: { type: Number, required: true, default: 0 },
    closingBookBalance: { type: Number, required: true, default: 0 },
    openingStatementBalance: { type: Number, required: true, default: 0 },
    closingStatementBalance: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      enum: ["in_progress", "completed", "locked"],
      default: "in_progress",
      index: true,
    },
    completedAt: { type: Date, default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lockedAt: { type: Date, default: null },
    adjustedBookBalance: { type: Number, default: 0 },
    adjustedBankBalance: { type: Number, default: 0 },
    isBalanced: { type: Boolean, default: false },
    outstandingDeposits: { type: Number, default: 0 },
    outstandingChecks: { type: Number, default: 0 },
    unrecordedBankItems: { type: Number, default: 0 },
    notes: { type: String, default: null },
  },
  { timestamps: true },
);

bankReconciliationSessionSchema.index({ companyId: 1, bankAccountId: 1, periodEnd: -1 });
bankReconciliationSessionSchema.index({ companyId: 1, status: 1 });

module.exports =
  mongoose.models.BankReconciliationSession ||
  mongoose.model("BankReconciliationSession", bankReconciliationSessionSchema);
