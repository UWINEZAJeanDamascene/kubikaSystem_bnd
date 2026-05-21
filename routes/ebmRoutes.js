const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const ebmController = require('../controllers/ebmController');
const { protect, authorize } = require('../middleware/auth');
const { attachCompanyId } = require('../middleware/companyContext');
const validateRequest = require('../middleware/validateRequest');
const stripUnvalidatedBody = require('../middleware/stripUnvalidatedBody');

router.use(protect);
router.use(attachCompanyId);

router.get('/devices', ebmController.getDeviceStatus);
router.get('/codes/status', ebmController.getCodeSyncStatus);
router.get('/codes', ebmController.getCodes);
router.get('/codes/item-classes', ebmController.getItemClasses);
router.get('/codes/tins', ebmController.searchTINs);
router.get('/notices', ebmController.getNotices);
router.get('/imports', ebmController.listImportedItems);

router.post(
  '/codes/sync',
  authorize('admin'),
  body('branchId').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 1, max: 2 }),
  body('bhfId').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 1, max: 2 }),
  body('full').optional().isBoolean(),
  validateRequest,
  stripUnvalidatedBody,
  ebmController.syncCodes,
);

router.post(
  '/devices/initialize',
  authorize('admin', 'stock_manager'),
  body('branchId').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 1, max: 2 }),
  body('bhfId').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 1, max: 2 }),
  body('deviceSerialNo').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 100 }),
  body('dvcSrlNo').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 100 }),
  body('tin').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 9 }),
  validateRequest,
  stripUnvalidatedBody,
  ebmController.initializeDevice,
);

router.post(
  '/branches/register',
  authorize('admin', 'stock_manager'),
  body('branchId').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 1, max: 2 }),
  body('bhfId').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 1, max: 2 }),
  validateRequest,
  stripUnvalidatedBody,
  ebmController.registerBranch,
);

router.post(
  '/imports/sync',
  authorize('admin', 'stock_manager'),
  body('branchId').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 1, max: 2 }),
  body('bhfId').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 1, max: 2 }),
  body('full').optional().isBoolean(),
  validateRequest,
  stripUnvalidatedBody,
  ebmController.syncImportedItems,
);

router.post(
  '/imports/:id/confirm',
  authorize('admin', 'stock_manager'),
  body('branchId').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 1, max: 2 }),
  body('warehouseId').notEmpty().withMessage('warehouseId is required').isMongoId(),
  body('productId').notEmpty().withMessage('productId is required').isMongoId(),
  body('supplierId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('unitCost').optional({ nullable: true }).isNumeric(),
  validateRequest,
  stripUnvalidatedBody,
  ebmController.confirmImportedItem,
);

router.post(
  '/imports/:id/reject',
  authorize('admin', 'stock_manager'),
  body('reason').notEmpty().withMessage('Rejection reason is required').isString().trim().isLength({ max: 500 }),
  validateRequest,
  stripUnvalidatedBody,
  ebmController.rejectImportedItem,
);

router.post(
  '/imports/:id/retry-stock',
  authorize('admin', 'stock_manager'),
  body('warehouseId').notEmpty().withMessage('warehouseId is required').isMongoId(),
  body('productId').notEmpty().withMessage('productId is required').isMongoId(),
  body('supplierId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('unitCost').optional({ nullable: true }).isNumeric(),
  validateRequest,
  stripUnvalidatedBody,
  ebmController.retryImportedItemStock,
);

module.exports = router;
