const express = require("express");
const router = express.Router();
const projectController = require("../controllers/projectController");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/authorize");

// All project routes require authentication
router.use(protect);

// Project CRUD
router.post("/", authorize("budgets", "create"), projectController.create);
router.get("/", authorize("budgets", "read"), projectController.getAll);
router.get("/statistics", authorize("budgets", "read"), projectController.getStatistics);

// WBS tree
router.get("/wbs-tree", authorize("budgets", "read"), projectController.getWBSTree);

router.get("/:id", authorize("budgets", "read"), projectController.getById);
router.put("/:id", authorize("budgets", "update"), projectController.update);
router.delete("/:id", authorize("budgets", "delete"), projectController.delete);

// WBS tree
router.get("/:id/wbs-tree", authorize("budgets", "read"), projectController.getWBSTree);

// Budget summary
router.get("/:id/budget-summary", authorize("budgets", "read"), projectController.getBudgetSummary);

// Clone
router.post("/:id/clone", authorize("budgets", "create"), projectController.clone);

module.exports = router;
