const express = require('express');
const router = express.Router();
const {
  getAll,
  getById,
  create,
  postAmortization,
  delete: deletePrepaid
} = require('../controllers/prepaidExpenseController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getAll)
  .post(create);

router.route('/:id')
  .get(getById)
  .delete(deletePrepaid);

router.route('/:id/amortizations/:amortizationId/post')
  .post(postAmortization);

module.exports = router;
