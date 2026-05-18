const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const {
  previewInterest,
  postInterest,
  confirmInterestReceipt,
  reverseInterest,
  getInterestAccruals,
  getInterestSummary,
  createFixedDeposit,
  getFixedDeposits,
  getFixedDeposit,
  updateFixedDeposit,
  deleteFixedDeposit,
  placeFixedDeposit,
  accrueFixedDeposit,
  matureFixedDeposit,
} = require("../controllers/interestController");

router.use(protect);

// Interest calculation & posting (on bank account)
router.post("/bank-accounts/:id/interest-calculate", previewInterest);
router.post("/bank-accounts/:id/interest-post", postInterest);

// Interest accrual management
router.get("/interest-accruals", getInterestAccruals);
router.post("/interest-accruals/:accrualId/confirm", confirmInterestReceipt);
router.post("/interest-accruals/:accrualId/reverse", reverseInterest);

// Interest summary
router.get("/interest-summary", getInterestSummary);

// Fixed Deposit CRUD
router.route("/fixed-deposits").get(getFixedDeposits).post(createFixedDeposit);
router.route("/fixed-deposits/:id").get(getFixedDeposit).put(updateFixedDeposit).delete(deleteFixedDeposit);

// Fixed Deposit actions
router.post("/fixed-deposits/:id/place", placeFixedDeposit);
router.post("/fixed-deposits/:id/accrue", accrueFixedDeposit);
router.post("/fixed-deposits/:id/mature", matureFixedDeposit);

module.exports = router;
