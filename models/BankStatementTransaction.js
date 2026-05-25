const mongoose = require("mongoose");

const bankStatementTransactionSchema = new mongoose.Schema(
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
    reconciliationSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankReconciliationSession",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    reference: {
      type: String,
      default: null,
      trim: true,
    },
    debit: {
      type: Number,
      default: 0,
      min: 0,
    },
    credit: {
      type: Number,
      default: 0,
      min: 0,
    },
    balance: {
      type: Number,
      default: 0,
    },
    matchStatus: {
      type: String,
      enum: ["unmatched", "matched", "manually_cleared"],
      default: "unmatched",
      index: true,
    },
    matchedBookTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankTransaction",
      default: null,
    },
    importedAt: {
      type: Date,
      default: Date.now,
    },
    importSource: {
      type: String,
      enum: ["csv", "manual", "excel"],
      default: "manual",
    },
    isAdjustment: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

bankStatementTransactionSchema.pre("validate", function (next) {
  this.debit = Number(this.debit || 0);
  this.credit = Number(this.credit || 0);
  if (this.debit > 0 && this.credit > 0) {
    return next(new Error("A bank statement transaction cannot have both debit and credit amounts."));
  }
  next();
});

bankStatementTransactionSchema.index({ companyId: 1, reconciliationSessionId: 1, matchStatus: 1 });
bankStatementTransactionSchema.index({ companyId: 1, bankAccountId: 1, date: 1 });

module.exports =
  mongoose.models.BankStatementTransaction ||
  mongoose.model("BankStatementTransaction", bankStatementTransactionSchema);
