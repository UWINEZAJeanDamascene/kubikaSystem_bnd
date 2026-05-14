const express = require('express');
const router = express.Router();
const {
  getSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierPurchaseHistory,
  toggleSupplierStatus
} = require('../controllers/supplierController');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbacMiddleware');
const logAction = require('../middleware/logAction');

router.use(protect);

router.route('/')
  .get(requirePermission('suppliers', 'read'), getSuppliers)
  .post(requirePermission('suppliers', 'create'), logAction('supplier'), createSupplier);

router.route('/:id')
  .get(requirePermission('suppliers', 'read'), getSupplier)
  .put(requirePermission('suppliers', 'update'), logAction('supplier'), updateSupplier)
  .delete(requirePermission('suppliers', 'delete'), logAction('supplier'), deleteSupplier);

router.get('/:id/purchase-history', requirePermission('suppliers', 'read'), getSupplierPurchaseHistory);

router.put('/:id/toggle-status', requirePermission('suppliers', 'update'), logAction('supplier'), toggleSupplierStatus);

module.exports = router;
