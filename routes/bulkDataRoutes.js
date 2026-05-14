const express = require('express');
const router = express.Router();
const {
  exportProducts,
  exportClients,
  exportSuppliers,
  importProducts,
  importClients,
  importSuppliers,
  downloadTemplate,
  uploadCSV,
  getImportTypes,
  exportGeneric,
  importGeneric,
  downloadTemplateGeneric
} = require('../controllers/bulkDataController');
const { protect, authorize } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbacMiddleware');
const logAction = require('../middleware/logAction');

const bulkPermissions = {
  products: 'products',
  clients: 'clients',
  suppliers: 'suppliers',
  categories: 'products',
  warehouses: 'warehouses',
  bank_accounts: 'bank_accounts',
  chart_of_accounts: 'chart_of_accounts'
};

const requireBulkPermission = (action) => (req, res, next) => {
  const resource = bulkPermissions[req.params.type];
  if (!resource) return res.status(400).json({ success: false, message: 'Invalid bulk data type' });
  return requirePermission(resource, action)(req, res, next);
};

router.use(protect);

router.get('/types', getImportTypes);

// Export routes
router.get('/export/:type', requireBulkPermission('read'), exportGeneric);

// Template download
router.get('/template/:type', downloadTemplateGeneric);

// Import routes (with file upload)
router.post('/import/:type', requireBulkPermission('create'), logAction('bulk_import'), uploadCSV, importGeneric);

module.exports = router;
