const express = require('express');
const router = express.Router();
const {
  getAdvances,
  getAdvance,
  createAdvance,
  recordRepayment,
  settleAdvance,
  getEmployeeBalance,
  deleteAdvance
} = require('../controllers/employeeAdvanceController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getAdvances)
  .post(createAdvance);

router.route('/:id')
  .get(getAdvance)
  .delete(deleteAdvance);

router.route('/:id/repayment')
  .post(recordRepayment);

router.route('/:id/settle')
  .post(settleAdvance);

router.route('/employee/:employeeId/balance')
  .get(getEmployeeBalance);

module.exports = router;
