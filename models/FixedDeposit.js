const mongoose = require("mongoose");

const fixedDepositSchema = new mongoose.Schema(
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
    depositReference: {
      type: String,
      required: true,
      trim: true,
    },
    bankName: {
      type: String,
      required: true,
      trim: true,
    },
    principalAmount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: function (value) {
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    interestRate: {
      type: Number,
      required: true,
      min: 0,
    },
    startDate: {
      type: Date,
      required: true,
    },
    maturityDate: {
      type: Date,
      required: true,
    },
    interestPaymentFrequency: {
      type: String,
      enum: ["monthly", "at_maturity"],
      default: "at_maturity",
    },
    linkedAssetAccount: {
      type: String,
      default: "1105",
      trim: true,
    },
    linkedIncomeAccount: {
      type: String,
      default: "4300",
      trim: true,
    },
    linkedAccrualAccount: {
      type: String,
      default: "1350",
      trim: true,
    },
    autoRollover: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["active", "matured", "closed", "rolled_over"],
      default: "active",
    },
    totalInterestAccrued: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      get: function (value) {
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    totalInterestReceived: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
      get: function (value) {
        return value ? parseFloat(value.toString()) : 0;
      },
    },
    notes: {
      type: String,
      trim: true,
      default: null,
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

fixedDepositSchema.index({ company: 1, status: 1 });
fixedDepositSchema.index({ company: 1, maturityDate: 1 });

fixedDepositSchema.set("toJSON", {
  transform: function (doc, ret) {
    if (ret.principalAmount && ret.principalAmount.$numberDecimal) {
      ret.principalAmount = parseFloat(ret.principalAmount.$numberDecimal);
    }
    if (ret.totalInterestAccrued && ret.totalInterestAccrued.$numberDecimal) {
      ret.totalInterestAccrued = parseFloat(ret.totalInterestAccrued.$numberDecimal);
    }
    if (ret.totalInterestReceived && ret.totalInterestReceived.$numberDecimal) {
      ret.totalInterestReceived = parseFloat(ret.totalInterestReceived.$numberDecimal);
    }
    return ret;
  },
});

module.exports = mongoose.model("FixedDeposit", fixedDepositSchema);
