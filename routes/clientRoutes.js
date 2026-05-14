const express = require('express');
const router = express.Router();
const {
  getClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  getClientPurchaseHistory,
  getClientOutstandingInvoices,
  toggleClientStatus,
  getClientsWithStats,
  exportClientsToPDF,
  getClientInvoices,
  getClientReceipts,
  getClientCreditNotes,
  getClientStatementPDF
} = require('../controllers/clientController');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbacMiddleware');
const logAction = require('../middleware/logAction');

router.use(protect);

router.route('/')
  .get(requirePermission('clients', 'read'), getClients)
  .post(requirePermission('clients', 'create'), logAction('client'), createClient);

// New route for clients with stats (for list view with outstanding invoice counts)
router.get('/with-stats', requirePermission('clients', 'read'), getClientsWithStats);

// Export route
router.get('/export/pdf', requirePermission('clients', 'read'), exportClientsToPDF);

router.route('/:id')
  .get(requirePermission('clients', 'read'), getClient)
  .put(requirePermission('clients', 'update'), logAction('client'), updateClient)
  .delete(requirePermission('clients', 'delete'), logAction('client'), deleteClient);

// Toggle status
router.put('/:id/toggle-status', requirePermission('clients', 'update'), toggleClientStatus);

router.get('/:id/purchase-history', requirePermission('clients', 'read'), getClientPurchaseHistory);
router.get('/:id/outstanding-invoices', requirePermission('clients', 'read'), getClientOutstandingInvoices);

// Client detail endpoints
router.get('/:id/invoices', requirePermission('clients', 'read'), getClientInvoices);
router.get('/:id/receipts', requirePermission('clients', 'read'), getClientReceipts);
router.get('/:id/credit-notes', requirePermission('clients', 'read'), getClientCreditNotes);
router.get('/:id/statement', requirePermission('clients', 'read'), getClientStatementPDF);

module.exports = router;
