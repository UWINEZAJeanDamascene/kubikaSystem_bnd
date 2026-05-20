const PLStatementService = require('../services/plStatementService');

/**
 * P&L Statement Controller
 * 
 * Generates Profit & Loss Statement - shows revenue earned and expenses incurred
 * in a period, arriving at gross profit, operating profit, and net profit.
 */

/**
 * GET /api/reports/profit-and-loss
 * Query params: date_from (required), date_to (required), comparative_date_from (optional), comparative_date_to (optional)
 */
const getPLStatement = async (req, res) => {
  try {
    const { date_from, date_to, comparative_date_from, comparative_date_to } = req.query;

    if (!date_from || !date_to) {
      return res.status(422).json({
        error: 'DATE_RANGE_REQUIRED',
        message: 'date_from and date_to are required query parameters'
      });
    }

    const statement = await PLStatementService.generate(req.companyId, {
      dateFrom: date_from,
      dateTo: date_to,
      comparativeDateFrom: comparative_date_from,
      comparativeDateTo: comparative_date_to,
    });

    res.json({ ...statement, from_cache: false, report_version: 'pl-direct-labor-fallback-v4' });
  } catch (err) {
    const validationErrors = new Set([
      'DATE_RANGE_REQUIRED',
      'INVALID_DATE_RANGE',
      'COMPARATIVE_DATE_RANGE_REQUIRED',
      'INVALID_COMPARATIVE_DATE_RANGE',
    ]);
    const status = validationErrors.has(err.message) ? 422 : 500;
    res.status(status).json({ error: err.message });
  }
};

module.exports = {
  getPLStatement
};
