const express = require('express');
const router = express.Router();
const {
  getAll,
  getById,
  create,
  postRecognition,
  delete: deleteDeferred
} = require('../controllers/deferredRevenueController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getAll)
  .post(create);

router.route('/:id')
  .get(getById)
  .delete(deleteDeferred);

router.route('/:id/recognitions/:recognitionId/post')
  .post(postRecognition);

module.exports = router;
