const express = require('express');
const router = express.Router();
const {
  getEmployees,
  getNextEmployeeId,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  changeSalary,
  getSalaryHistory,
  terminateEmployee,
  deleteEmployee,
} = require('../controllers/employeeController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getEmployees)
  .post(authorize('admin', 'manager', 'hr'), createEmployee);

router.route('/next-id')
  .get(getNextEmployeeId);

router.route('/:id')
  .get(getEmployeeById)
  .put(authorize('admin', 'manager', 'hr'), updateEmployee)
  .delete(authorize('admin', 'manager'), deleteEmployee);

router.route('/:id/salary')
  .put(authorize('admin', 'manager', 'hr'), changeSalary);

router.route('/:id/salary-history')
  .get(getSalaryHistory);

router.route('/:id/terminate')
  .put(authorize('admin', 'manager', 'hr'), terminateEmployee);

module.exports = router;
