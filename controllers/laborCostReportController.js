const LaborCostReportService = require('../services/laborCostReportService');

exports.getLaborCostAnalysis = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { year, month, viewBy } = req.query;

    const data = await LaborCostReportService.getAnalysis(
      companyId,
      year ? parseInt(year) : null,
      month ? parseInt(month) : null,
      viewBy || 'employee'
    );

    res.json({ success: true, data });
  } catch (e) { next(e); }
};

exports.getPayrollAuditTrail = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { payrollRunId } = req.query;

    const data = await LaborCostReportService.getAuditTrail(
      companyId,
      payrollRunId || null
    );

    res.json({ success: true, count: data.length, data });
  } catch (e) { next(e); }
};
