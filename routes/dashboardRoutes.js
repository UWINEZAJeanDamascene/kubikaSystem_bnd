const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getRecentActivities,
  getLowStockAlerts,
  getTopSellingProducts,
  getTopClients,
  getSalesChart,
  getStockMovementChart
} = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');
const { sessionMiddleware } = require('../middleware/cacheMiddleware');

router.use(protect);
router.use(sessionMiddleware);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/stats', getDashboardStats);
router.get('/recent-activities', getRecentActivities);
router.get('/low-stock-alerts', getLowStockAlerts);
router.get('/top-selling-products', getTopSellingProducts);
router.get('/top-clients', getTopClients);
router.get('/sales-chart', getSalesChart);
router.get('/stock-movement-chart', getStockMovementChart);

module.exports = router;
