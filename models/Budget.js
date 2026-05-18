const mongoose = require("mongoose");

const budgetSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    purpose: {
      type: String,
      trim: true,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
      set: (value) =>
        Array.isArray(value)
          ? value.map((tag) => String(tag).trim()).filter(Boolean)
          : [],
    },
    category: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: ["revenue", "expense", "profit", "opex", "capex", "project"],
      default: "expense",
    },
    budget_cycle: {
      type: String,
      enum: ["fixed_year", "rolling"],
      default: "fixed_year",
    },
    fiscal_year: {
      type: Number,
      required: true,
    },
    periodStart: {
      type: Date,
      default: null,
    },
    periodEnd: {
      type: Date,
      default: null,
    },
    periodType: {
      type: String,
      enum: ["monthly", "quarterly", "yearly", "custom"],
      default: "yearly",
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },
    base_currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    exchange_rate_type: {
      type: String,
      enum: ["fixed", "spot", "average"],
      default: "spot",
    },
    exchange_rate: {
      type: Number,
      default: 1,
      min: 0,
    },
    allow_multi_currency: {
      type: Boolean,
      default: false,
    },
    allocation_method: {
      type: String,
      enum: ["manual", "top_down", "bottom_up", "percentage_split"],
      default: "manual",
    },
    status: {
      type: String,
      enum: [
        "draft",
        "pending_approval",
        "active",
        "approved",
        "rejected",
        "closed",
        "cancelled",
        "locked",
      ],
      default: "draft",
    },
    workflow_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BudgetWorkflowConfig",
      default: null,
      index: true,
    },
    current_approval_step: {
      type: Number,
      default: 0,
    },
    total_approval_steps: {
      type: Number,
      default: 0,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approved_at: {
      type: Date,
      default: null,
    },
    locked_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    locked_at: {
      type: Date,
      default: null,
    },
    unlocked_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    unlocked_at: {
      type: Date,
      default: null,
    },
    rejected_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejected_at: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },
    closed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    closed_at: {
      type: Date,
      default: null,
    },
    closeNotes: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    // Auto-lock settings
    auto_lock: {
      enabled: {
        type: Boolean,
        default: false,
      },
      days_after_period_end: {
        type: Number,
        default: 0,
      },
    },
    fiscal_year_end: {
      type: Date,
      default: null,
    },
    year_end_lock: {
      type: Boolean,
      default: false,
    },
    auto_locked: {
      type: Boolean,
      default: false,
    },
    // Scenario / What-If Analysis fields
    scenario_type: {
      type: String,
      enum: ["base", "optimistic", "pessimistic", "custom"],
      default: "base",
      index: true,
    },
    scenario_name: {
      type: String,
      trim: true,
      default: null,
    },
    scenario_group_id: {
      type: String,
      index: true,
      default: null,
    },
    is_primary_scenario: {
      type: Boolean,
      default: true,
    },
    parent_budget_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Budget",
      default: null,
    },
    scenario_description: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function(doc, ret) {
        // Convert Decimal128 to number
        if (ret.amount && typeof ret.amount === 'object' && ret.amount.$numberDecimal) {
          ret.amount = parseFloat(ret.amount.$numberDecimal);
        } else if (ret.amount && typeof ret.amount.toString === 'function') {
          ret.amount = parseFloat(ret.amount.toString());
        }
        return ret;
      },
    },
  },
);

// Allow multiple scenarios per fiscal year per company
budgetSchema.index(
  { company_id: 1, fiscal_year: 1, name: 1, scenario_type: 1 },
  { unique: true },
);
budgetSchema.index(
  { company_id: 1, code: 1, scenario_type: 1 },
  { unique: true, partialFilterExpression: { code: { $type: "string" } } },
);
budgetSchema.index({ company_id: 1, status: 1 });
budgetSchema.index({ company_id: 1, type: 1 });
budgetSchema.index({ company_id: 1, department: 1 });
budgetSchema.index({ company_id: 1, owner_id: 1 });
budgetSchema.index({ company_id: 1, entity_id: 1 });
budgetSchema.index({ company_id: 1, tags: 1 });
budgetSchema.index({ company_id: 1, periodStart: 1, periodEnd: 1 });
budgetSchema.index({ company_id: 1, scenario_group_id: 1 });
budgetSchema.index({ company_id: 1, parent_budget_id: 1 });

module.exports = mongoose.model("Budget", budgetSchema);
