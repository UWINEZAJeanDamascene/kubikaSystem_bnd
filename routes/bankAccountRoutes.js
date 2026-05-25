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
  getBankAccountBalance,
  addTransaction,
  transfer,
  transferToCash,
  getCashPosition,
  getAllTransactions,
  adjustBalance,
  getAccountStats,
  getBankStatement,
  importCSV,
  createOpeningBalance,
  fixOpeningBalances,
} = require("../controllers/bankAccountController");

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

router.route("/:id/adjust").post(adjustBalance);

router.route("/:id/stats").get(getAccountStats);

router.route("/:id/balance").get(getBankAccountBalance);

router.route("/:id/statement").get(getBankStatement);

// CSV Import
router.route("/:id/import-csv").post(importCSV);

// Opening balance (posts opening journal entry)
router.route("/:id/opening-balance").post(createOpeningBalance);

module.exports = router;
