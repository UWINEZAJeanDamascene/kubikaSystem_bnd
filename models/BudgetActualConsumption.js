const mongoose = require("mongoose");

const budgetActualConsumptionSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    budget_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Budget",
      required: true,
      index: true,
    },
    budget_line_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BudgetLine",
      required: true,
      index: true,
    },
    account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChartOfAccount",
      required: true,
    },
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    wbs_code: {
      type: String,
      trim: true,
      default: null,
    },
    origin_type: {
      type: String,
      enum: ["encumbrance_liquidation", "direct_actual"],
      required: true,
      index: true,
    },
    document_type: {
      type: String,
      required: true,
      trim: true,
    },
    document_id: {
      type: String,
      required: true,
      trim: true,
    },
    document_number: {
      type: String,
      default: "",
      trim: true,
    },
    document_date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: 0,
    },
    source_type: {
      type: String,
      default: "",
      trim: true,
    },
    source_id: {
      type: String,
      default: "",
      trim: true,
    },
    source_number: {
      type: String,
      default: "",
      trim: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        if (ret.amount && typeof ret.amount.toString === "function") {
          ret.amount = parseFloat(ret.amount.toString());
        }
        return ret;
      },
    },
  },
);

budgetActualConsumptionSchema.index({
  company_id: 1,
  budget_id: 1,
  budget_line_id: 1,
  document_date: -1,
});

module.exports = mongoose.model(
  "BudgetActualConsumption",
  budgetActualConsumptionSchema,
);
