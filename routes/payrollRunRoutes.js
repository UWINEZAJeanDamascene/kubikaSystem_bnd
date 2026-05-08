const express = require("express");
const router = express.Router();
const {
  getPayrollRuns,
  getPayrollRunById,
  createPayrollRun,
  postPayrollRun,
  reversePayrollRun,
  deletePayrollRun,
  previewPayrollRun,
  createFromRecords,
  getAvailablePeriods,
  remitPaye,
  remitRssb,
  generateBankTransfer,
} = require("../controllers/payrollRunController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

// CRUD routes
router
  .route("/")
  .get(getPayrollRuns)
  .post(authorize("admin", "manager"), createPayrollRun);

// Preview journal entry before posting (MUST be before /:id)
router.route("/preview").get(authorize("admin", "manager"), previewPayrollRun);

// Available periods — months that have finalised, unprocessed payroll records
// (MUST be before /:id so it is not treated as an id param)
router.route("/available-periods").get(getAvailablePeriods);

// Create payroll run from finalised employee records (MUST be before /:id)
router
  .route("/from-records")
  .post(authorize("admin", "manager"), createFromRecords);

router
  .route("/:id")
  .get(getPayrollRunById)
  .delete(authorize("admin"), deletePayrollRun);

// Post payroll run (creates journal entry)
router.route("/:id/post").post(authorize("admin"), postPayrollRun);

// Reverse payroll run
router.route("/:id/reverse").post(authorize("admin"), reversePayrollRun);

// Remittance tracking (Rwanda RRA / RSSB compliance)
router.route("/:id/remit-paye").post(authorize("admin"), remitPaye);
router.route("/:id/remit-rssb").post(authorize("admin"), remitRssb);

// Bank transfer export (CSV/Excel/XML for bank upload)
router.route("/:id/bank-transfer").get(authorize("admin", "manager"), generateBankTransfer);

module.exports = router;
