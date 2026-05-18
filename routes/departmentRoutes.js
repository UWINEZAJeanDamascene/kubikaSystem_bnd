const express = require('express');
const router = express.Router();
const {
  getDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  assignUsers,
  removeUser,
  getDepartmentEmployees,
  assignEmployees,
  removeEmployee
} = require('../controllers/departmentController');
const { protect, authorize } = require('../middleware/auth');
const logAction = require('../middleware/logAction');

router.use(protect);

router.route('/')
  .get(getDepartments)
  .post(authorize('admin'), logAction('department'), createDepartment);

router.route('/:id')
  .get(getDepartment)
  .put(authorize('admin'), logAction('department'), updateDepartment)
  .delete(authorize('admin'), logAction('department'), deleteDepartment);

router.put('/:id/assign-users', authorize('admin'), logAction('department'), assignUsers);
router.put('/:id/remove-user/:userId', authorize('admin'), logAction('department'), removeUser);

// Employee department routes
router.get('/:id/employees', protect, getDepartmentEmployees);
router.put('/:id/assign-employees', authorize('admin'), logAction('department'), assignEmployees);
router.put('/:id/remove-employee/:employeeId', authorize('admin'), logAction('department'), removeEmployee);

module.exports = router;
