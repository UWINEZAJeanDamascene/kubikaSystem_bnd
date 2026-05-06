const projectService = require("../services/projectService");
const Project = require("../models/Project");

/**
 * Project Controller - API endpoints for Project/Job-Level Budgeting
 */

class ProjectController {
  /**
   * Create a new project
   */
  async create(req, res, next) {
    try {
      const companyId = req.companyId || req.company?._id;
      if (!companyId) {
        return res.status(400).json({
          success: false,
          error: "Company context is required",
        });
      }

      const project = await projectService.createProject(
        companyId,
        req.body,
        req.user._id
      );

      res.status(201).json({
        success: true,
        data: project,
        message: "Project created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all projects
   */
  async getAll(req, res, next) {
    try {
      const companyId = req.companyId || req.company?._id;
      if (!companyId) {
        return res.status(400).json({
          success: false,
          error: "Company context is required",
        });
      }

      const filters = {
        status: req.query.status,
        type: req.query.type,
        department_id: req.query.department_id,
        client_id: req.query.client_id,
        manager_id: req.query.manager_id,
        is_active: req.query.is_active,
        search: req.query.search,
      };

      const projects = await projectService.getAllProjects(companyId, filters);

      res.json({
        success: true,
        data: projects,
        count: projects.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get project by ID
   */
  async getById(req, res, next) {
    try {
      const companyId = req.companyId || req.company?._id;
      if (!companyId) {
        return res.status(400).json({
          success: false,
          error: "Company context is required",
        });
      }

      const project = await projectService.getProjectById(
        companyId,
        req.params.id
      );

      res.json({
        success: true,
        data: project,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update project
   */
  async update(req, res, next) {
    try {
      const companyId = req.companyId || req.company?._id;
      if (!companyId) {
        return res.status(400).json({
          success: false,
          error: "Company context is required",
        });
      }

      const project = await projectService.updateProject(
        companyId,
        req.params.id,
        req.body
      );

      res.json({
        success: true,
        data: project,
        message: "Project updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete project
   */
  async delete(req, res, next) {
    try {
      const companyId = req.companyId || req.company?._id;
      if (!companyId) {
        return res.status(400).json({
          success: false,
          error: "Company context is required",
        });
      }

      const result = await projectService.deleteProject(companyId, req.params.id);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get WBS tree
   */
  async getWBSTree(req, res, next) {
    try {
      const companyId = req.companyId || req.company?._id;
      if (!companyId) {
        return res.status(400).json({
          success: false,
          error: "Company context is required",
        });
      }

      const tree = await projectService.getWBSTree(
        companyId,
        req.params.id || null
      );

      res.json({
        success: true,
        data: tree,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get budget summary for a project
   */
  async getBudgetSummary(req, res, next) {
    try {
      const companyId = req.companyId || req.company?._id;
      if (!companyId) {
        return res.status(400).json({
          success: false,
          error: "Company context is required",
        });
      }

      const summary = await projectService.getBudgetSummary(
        companyId,
        req.params.id
      );

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Clone a project
   */
  async clone(req, res, next) {
    try {
      const companyId = req.companyId || req.company?._id;
      if (!companyId) {
        return res.status(400).json({
          success: false,
          error: "Company context is required",
        });
      }

      const { new_code, new_name } = req.body;
      if (!new_code || !new_name) {
        return res.status(400).json({
          success: false,
          error: "new_code and new_name are required",
        });
      }

      const cloned = await projectService.cloneProject(
        companyId,
        req.params.id,
        new_code,
        new_name
      );

      res.status(201).json({
        success: true,
        data: cloned,
        message: "Project cloned successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get project statistics
   */
  async getStatistics(req, res, next) {
    try {
      const companyId = req.companyId || req.company?._id;
      if (!companyId) {
        return res.status(400).json({
          success: false,
          error: "Company context is required",
        });
      }

      const byStatus = await Project.aggregate([
        { $match: { company_id: companyId } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            total_budget: { $sum: "$budget_allocated" },
            total_spent: { $sum: "$budget_spent" },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const byType = await Project.aggregate([
        { $match: { company_id: companyId } },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      res.json({
        success: true,
        data: {
          by_status: byStatus,
          by_type: byType,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProjectController();
