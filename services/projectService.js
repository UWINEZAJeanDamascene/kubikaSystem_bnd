const Project = require("../models/Project");
const BudgetLine = require("../models/BudgetLine");
const mongoose = require("mongoose");

/**
 * Project Service - Business logic for Project/Job-Level Budgeting
 */

class ProjectService {
  /**
   * Generate WBS code based on parent and level
   */
  async generateWBSCode(companyId, parentId, projectCode) {
    if (!parentId) {
      return projectCode;
    }

    const parent = await Project.findOne({
      _id: parentId,
      company_id: companyId,
    });

    if (!parent) {
      throw new Error("Parent project not found");
    }

    const siblings = await Project.find({
      company_id: companyId,
      parent_id: parentId,
    }).sort({ wbs_code: 1 });

    const nextNum = siblings.length + 1;
    return `${parent.wbs_code}.${nextNum}`;
  }

  /**
   * Create a new project
   */
  async createProject(companyId, data, userId) {
    const {
      project_code,
      name,
      description,
      parent_id,
      type,
      status,
      priority,
      budget_allocated,
      start_date,
      end_date,
      department_id,
      client_id,
      manager_id,
      billing_type,
      contract_value,
    } = data;

    // Check for duplicate project code
    const existing = await Project.findOne({
      company_id: companyId,
      project_code: project_code.trim(),
    });

    if (existing) {
      throw new Error(`Project code '${project_code}' already exists`);
    }

    // Determine WBS level
    let wbsLevel = 1;
    if (parent_id) {
      const parent = await Project.findOne({
        _id: parent_id,
        company_id: companyId,
      });
      if (!parent) {
        throw new Error("Parent project not found");
      }
      wbsLevel = parent.wbs_level + 1;
    }

    // Generate WBS code
    const wbsCode = await this.generateWBSCode(
      companyId,
      parent_id || null,
      project_code.trim()
    );

    const project = await Project.create({
      company_id: companyId,
      project_code: project_code.trim(),
      name: name.trim(),
      description: description ? description.trim() : "",
      parent_id: parent_id || null,
      wbs_level: wbsLevel,
      wbs_code: wbsCode,
      type: type || "project",
      status: status || "planning",
      priority: priority || "medium",
      budget_allocated: budget_allocated || 0,
      budget_spent: 0,
      budget_remaining: budget_allocated || 0,
      start_date: start_date || null,
      end_date: end_date || null,
      department_id: department_id || null,
      client_id: client_id || null,
      manager_id: manager_id || null,
      billing_type: billing_type || "none",
      contract_value: contract_value || 0,
    });

    return project;
  }

  /**
   * Get all projects with optional filters
   */
  async getAllProjects(companyId, filters = {}) {
    const query = { company_id: companyId };

    if (filters.status) query.status = filters.status;
    if (filters.type) query.type = filters.type;
    if (filters.department_id) query.department_id = filters.department_id;
    if (filters.client_id) query.client_id = filters.client_id;
    if (filters.manager_id) query.manager_id = filters.manager_id;
    if (filters.is_active !== undefined) {
      query.is_active = filters.is_active === true || filters.is_active === "true";
    }
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: "i" } },
        { project_code: { $regex: filters.search, $options: "i" } },
        { wbs_code: { $regex: filters.search, $options: "i" } },
      ];
    }

    const projects = await Project.find(query)
      .sort({ wbs_code: 1 })
      .populate("parent_id", "name wbs_code project_code")
      .populate("department_id", "name code")
      .populate("client_id", "name")
      .populate("manager_id", "firstName lastName email");

    return projects;
  }

  /**
   * Get project by ID
   */
  async getProjectById(companyId, projectId) {
    const project = await Project.findOne({
      _id: projectId,
      company_id: companyId,
    })
      .populate("parent_id", "name wbs_code project_code")
      .populate("department_id", "name code")
      .populate("client_id", "name")
      .populate("manager_id", "firstName lastName email");

    if (!project) {
      throw new Error("Project not found");
    }

    return project;
  }

  /**
   * Update a project
   */
  async updateProject(companyId, projectId, data) {
    const project = await Project.findOne({
      _id: projectId,
      company_id: companyId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    // Check for duplicate project code if changed
    if (data.project_code && data.project_code !== project.project_code) {
      const existing = await Project.findOne({
        company_id: companyId,
        project_code: data.project_code.trim(),
        _id: { $ne: projectId },
      });
      if (existing) {
        throw new Error(`Project code '${data.project_code}' already exists`);
      }
    }

    // Recalculate budget_remaining if budget_allocated changes
    if (data.budget_allocated !== undefined) {
      data.budget_remaining = data.budget_allocated - (project.budget_spent || 0);
    }

    const updated = await Project.findByIdAndUpdate(
      projectId,
      { $set: data },
      { new: true, runValidators: true }
    )
      .populate("parent_id", "name wbs_code project_code")
      .populate("department_id", "name code")
      .populate("client_id", "name")
      .populate("manager_id", "firstName lastName email");

    return updated;
  }

  /**
   * Delete a project
   */
  async deleteProject(companyId, projectId) {
    const project = await Project.findOne({
      _id: projectId,
      company_id: companyId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    // Check for children
    const children = await Project.countDocuments({
      company_id: companyId,
      parent_id: projectId,
    });

    if (children > 0) {
      throw new Error(
        "Cannot delete project with sub-projects. Delete sub-projects first."
      );
    }

    // Check for linked budget lines
    const budgetLines = await BudgetLine.countDocuments({
      company_id: companyId,
      project_id: projectId,
    });

    if (budgetLines > 0) {
      throw new Error(
        "Cannot delete project with linked budget lines. Remove budget lines first."
      );
    }

    await Project.findByIdAndDelete(projectId);
    return { success: true, message: "Project deleted" };
  }

  /**
   * Get WBS tree structure
   */
  async getWBSTree(companyId, rootProjectId = null) {
    const allProjects = await Project.find({ company_id: companyId, is_active: true })
      .sort({ wbs_code: 1 })
      .lean();

    // Build tree
    const buildTree = (parentId) => {
      return allProjects
        .filter((p) => {
          if (parentId === null) {
            return !p.parent_id;
          }
          return p.parent_id && p.parent_id.toString() === parentId.toString();
        })
        .map((p) => ({
          ...p,
          children: buildTree(p._id),
        }));
    };

    return buildTree(rootProjectId || null);
  }

  /**
   * Get budget summary for a project
   */
  async getBudgetSummary(companyId, projectId) {
    const project = await Project.findOne({
      _id: projectId,
      company_id: companyId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    // Get budget lines for this project
    const budgetLines = await BudgetLine.find({
      company_id: companyId,
      project_id: projectId,
    })
      .populate("account_id", "code name type")
      .populate("budget_id", "name fiscal_year");

    // Calculate totals
    const summary = budgetLines.reduce(
      (acc, line) => {
        acc.total_budgeted += line.budgeted_amount || 0;
        acc.total_actual += line.actual_amount || 0;
        acc.total_encumbered += line.encumbered_amount || 0;
        return acc;
      },
      {
        total_budgeted: 0,
        total_actual: 0,
        total_encumbered: 0,
      }
    );

    summary.total_remaining =
      summary.total_budgeted - summary.total_actual - summary.total_encumbered;

    return {
      project,
      budget_summary: summary,
      line_count: budgetLines.length,
      budget_lines: budgetLines,
    };
  }

  /**
   * Clone a project with its structure
   */
  async cloneProject(companyId, projectId, newCode, newName) {
    const original = await Project.findOne({
      _id: projectId,
      company_id: companyId,
    });

    if (!original) {
      throw new Error("Project not found");
    }

    // Create new top-level project
    const cloned = await Project.create({
      company_id: companyId,
      project_code: newCode,
      name: newName,
      description: original.description,
      parent_id: null,
      wbs_level: 1,
      wbs_code: newCode,
      type: original.type,
      status: "planning",
      priority: original.priority,
      budget_allocated: original.budget_allocated,
      budget_spent: 0,
      budget_remaining: original.budget_allocated,
      start_date: original.start_date,
      end_date: original.end_date,
      department_id: original.department_id,
      client_id: original.client_id,
      manager_id: original.manager_id,
      billing_type: original.billing_type,
      contract_value: original.contract_value,
    });

    return cloned;
  }

  /**
   * Update budget spent for a project
   */
  async updateBudgetSpent(companyId, projectId) {
    const lines = await BudgetLine.find({
      company_id: companyId,
      project_id: projectId,
    });

    const totals = lines.reduce(
      (acc, line) => {
        acc.budgeted += parseFloat(line.budgeted_amount?.toString() || "0");
        acc.spent += parseFloat(line.actual_amount?.toString() || "0");
        acc.encumbered += parseFloat(line.encumbered_amount?.toString() || "0");
        return acc;
      },
      { budgeted: 0, spent: 0, encumbered: 0 }
    );

    const project = await Project.findOne({
      _id: projectId,
      company_id: companyId,
    });

    if (project) {
      project.budget_allocated = totals.budgeted;
      project.budget_spent = totals.spent;
      project.budget_remaining = totals.budgeted - totals.spent - totals.encumbered;
      await project.save();
    }

    return project;
  }

  async updateBudgetSpentForProjects(companyId, projectIds = []) {
    const uniqueProjectIds = [...new Set(projectIds.filter(Boolean).map((id) => id.toString()))];
    await Promise.all(uniqueProjectIds.map((projectId) => this.updateBudgetSpent(companyId, projectId)));
  }
}

module.exports = new ProjectService();
