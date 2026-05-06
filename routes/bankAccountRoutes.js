const express = require("express");
const router = express.Router();
const multer = require("multer");

// Configure multer for CSV uploads (memory storage for processing)
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/csv', 'text/plain'];
    const allowedExt = file.originalname.toLowerCase().endsWith('.csv');
    if (allowedTypes.includes(file.mimetype) || allowedExt) {
      return cb(null, true);
    }
    cb(new Error('Only CSV files are allowed'));
  }
});

const {
  getBankAccounts,
  getBankAccount,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  getAccountTransactions,
  addTransaction,
  transfer,
  transferToCash,
  getCashPosition,
  reconcile,
  getAllTransactions,
  adjustBalance,
  getAccountStats,
  getBankStatement,
  importCSV,
  autoMatchTransactions,
  getReconciliationReport,
  getReconciliation,
  matchReconciliation,
  unmatchReconciliation,
  createOpeningBalance,
  fixOpeningBalances,
} = require("../controllers/bankAccountController");

// New professional bank reconciliation controller
const {
  startReconciliation,
  getReconciliationData,
  suggestMatches,
  matchItems,
  unmatchItems,
  ignoreStatementLine,
  createAdjustingEntry,
  completeReconciliation,
  cancelReconciliation,
  importStatement,
  listReconciliations,
  getReconciliationReport: getReconciliationReportNew,
} = require("../controllers/bankReconciliationController");

const { protect } = require("../middleware/auth");

// All routes require authentication
router.use(protect);

// Summary routes
router.route("/summary/position").get(getCashPosition);

// Fix missing opening balances (one-time admin endpoint)
router.route("/fix-opening-balances").post(fixOpeningBalances);

// Transfer route
router.route("/transfer").post(transfer);

// Transfer to another bank/Momo account route
router.route("/transfer-to-account").post(transferToCash);

// All transactions across all accounts
router.route("/transactions").get(getAllTransactions);

// CRUD routes for bank accounts
router.route("/").get(getBankAccounts).post(createBankAccount);

// Individual account routes
router
  .route("/:id")
  .get(getBankAccount)
  .put(updateBankAccount)
  .delete(deleteBankAccount);

// Account-specific routes
router
  .route("/:id/transactions")
  .get(getAccountTransactions)
  .post(addTransaction);

router.route("/:id/reconcile").post(reconcile);

router.route("/:id/adjust").post(adjustBalance);

router.route("/:id/stats").get(getAccountStats);

router.route("/:id/statement").get(getBankStatement);

// CSV Import
router.route("/:id/import-csv").post(importCSV);

// Auto-match
router.route("/:id/auto-match").post(autoMatchTransactions);

// Reconciliation routes
router.route("/:id/reconciliation").get(getReconciliation);

// Match reconciliation (POST creates, DELETE removes by matchId)
router.route("/:id/reconciliation/match").post(matchReconciliation);

// Unmatch a specific reconciliation match
router
  .route("/:id/reconciliation/match/:matchId")
  .delete(unmatchReconciliation);

// Opening balance (posts opening journal entry)
router.route("/:id/opening-balance").post(createOpeningBalance);

// Reconciliation Report (legacy)
router.route("/:id/reconciliation-report").get(getReconciliationReport);

// =====================================================
// NEW PROFESSIONAL BANK RECONCILIATION ROUTES
// =====================================================

// Start a new reconciliation session
router.route("/:id/reconciliation/start").post(startReconciliation);

// Get reconciliation data (both sides - journal lines vs statement lines)
router.route("/:id/reconciliation/data").get(getReconciliationData);

// Auto-match suggestions
router.route("/:id/reconciliation/suggest").get(suggestMatches);

// User-approved matching (creates link only, no auto-modification)
router.route("/:id/reconciliation/match-items").post(matchItems);

// Unmatch items
router.route("/:id/reconciliation/unmatch").post(unmatchItems);

// Ignore a statement line
router.route("/:id/reconciliation/ignore").post(ignoreStatementLine);

// Create adjusting entry (user-explicit only)
router.route("/:id/reconciliation/adjusting-entry").post(createAdjustingEntry);

// Complete reconciliation (only if difference = 0)
router.route("/:id/reconciliation/complete").post(completeReconciliation);

// Cancel in-progress reconciliation
router.route("/:id/reconciliation/cancel").post(cancelReconciliation);

// Import statement CSV with proper date parsing
router.route("/:id/reconciliation/import").post(csvUpload.single('file'), importStatement);

// List all reconciliations (history)
router.route("/:id/reconciliations").get(listReconciliations);

// Get detailed reconciliation report (new)
router.route("/:id/reconciliation/report").get(getReconciliationReportNew);

module.exports = router;
