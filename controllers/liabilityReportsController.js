const LiabilityReportsService = require('../services/liabilityReportsService');
const cacheService = require('../services/cacheService');

/**
 * Liability Reports Controller
 *
 * IFRS-compliant reports for liability management and disclosure.
 */

/**
 * GET /api/reports/debt-maturity
 * Query params: as_of_date (required), years_ahead (optional, default 5)
 *
 * Generates Debt Maturity Schedule per IAS 1 disclosure requirements.
 */
const getDebtMaturitySchedule = async (req, res) => {
  try {
    const { as_of_date, years_ahead = 5 } = req.query;

    if (!as_of_date) {
      return res.status(422).json({
        error: 'AS_OF_DATE_REQUIRED',
        message: 'as_of_date is a required query parameter'
      });
    }

    const cacheKey = {
      companyId: req.companyId,
      as_of_date,
      years_ahead: parseInt(years_ahead) || 5
    };

    const cfg = cacheService.getCacheConfig('report');
    const cached = await cacheService.fetchOrExecute(
      'report',
      async () => LiabilityReportsService.generateDebtMaturitySchedule(
        req.companyId,
        as_of_date,
        parseInt(years_ahead) || 5
      ),
      cacheKey,
      { ttl: cfg.ttl, useCompanyPrefix: true }
    );

    res.json({ ...cached.data, from_cache: cached.fromCache });
  } catch (err) {
    console.error('Debt Maturity Schedule Error:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/reports/interest-expense
 * Query params: date_from (required), date_to (required)
 *
 * Generates Interest Expense Analysis report.
 */
const getInterestExpenseAnalysis = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    if (!date_from || !date_to) {
      return res.status(422).json({
        error: 'DATE_RANGE_REQUIRED',
        message: 'date_from and date_to are required query parameters'
      });
    }

    const cacheKey = {
      companyId: req.companyId,
      date_from,
      date_to
    };

    const cfg = cacheService.getCacheConfig('report');
    const cached = await cacheService.fetchOrExecute(
      'report',
      async () => LiabilityReportsService.generateInterestExpenseAnalysis(
        req.companyId,
        date_from,
        date_to
      ),
      cacheKey,
      { ttl: cfg.ttl, useCompanyPrefix: true }
    );

    res.json({ ...cached.data, from_cache: cached.fromCache });
  } catch (err) {
    console.error('Interest Expense Analysis Error:', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getDebtMaturitySchedule,
  getInterestExpenseAnalysis
};
