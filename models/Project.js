const mongoose = require("mongoose");

/**
 * Project Model - Work Breakdown Structure (WBS) for Project/Job-Level Budgeting
 * 
 * Supports hierarchical project structures:
 * - Project (top level)
 *   - Job / Phase
 *     - Work Package
 *       - Task
 * 
 * Used for: Professional services, construction, agencies, job costing
 */

const projectSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    // Project identification
    project_code: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    // WBS Hierarchy fields
    parent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    wbs_level: {
      type: Number,
      required: true,
      default: 1, // 1 = Project, 2 = Job/Phase, 3 = Work Package, 4 = Task
      min: 1,
      max: 10,
    },
    wbs_code: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    // Project classification
    type: {
      type: String,
      enum: ["project", "job", "phase", "work_package", "task"],
      default: "project",
      index: true,
    },
    status: {
      type: String,
      enum: ["planning", "active", "on_hold", "completed", "cancelled"],
      default: "planning",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    // Budget fields
    budget_allocated: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    budget_spent: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    budget_remaining: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    // Timeline
    start_date: {
      type: Date,
      default: null,
    },
    end_date: {
      type: Date,
      default: null,
    },
    actual_start_date: {
      type: Date,
      default: null,
    },
    actual_end_date: {
      type: Date,
      default: null,
    },
    // Relationships
    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },
    client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
      index: true,
    },
    manager_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Billing/Contract
    billing_type: {
      type: String,
      enum: ["fixed_price", "time_material", "cost_plus", "none"],
      default: "none",
    },
    contract_value: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    // Progress tracking
    progress_percent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        // Convert Decimal128 fields to numbers
        ["budget_allocated", "budget_spent", "budget_remaining", "contract_value"].forEach(
          (field) => {
            if (ret[field] && typeof ret[field] === "object" && ret[field].$numberDecimal) {
              ret[field] = parseFloat(ret[field].$numberDecimal);
            } else if (ret[field] && typeof ret[field].toString === "function") {
              ret[field] = parseFloat(ret[field].toString());
            }
          }
        );
        return ret;
      },
    },
  }
);

// Compound indexes for efficient queries
projectSchema.index({ company_id: 1, project_code: 1 }, { unique: true });
projectSchema.index({ company_id: 1, status: 1 });
projectSchema.index({ company_id: 1, type: 1 });
projectSchema.index({ company_id: 1, parent_id: 1 });
projectSchema.index({ company_id: 1, wbs_code: 1 });
projectSchema.index({ company_id: 1, department_id: 1 });
projectSchema.index({ company_id: 1, client_id: 1 });
projectSchema.index({ company_id: 1, is_active: 1 });

module.exports = mongoose.model("Project", projectSchema);
