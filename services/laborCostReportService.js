const mongoose = require('mongoose');
const PayrollRun = require('../models/PayrollRun');
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');

class LaborCostReportService {

  /**
   * Labor Cost Analysis by view type
   * @param {string} companyId
   * @param {number} year
   * @param {number} month - optional
   * @param {string} viewBy - 'employee' | 'department' | 'account' | 'trend'
   */
  static async getAnalysis(companyId, year, month = null, viewBy = 'employee') {
    const match = { company: new mongoose.Types.ObjectId(companyId) };
    if (year) {
      match['pay_period_start'] = { $gte: new Date(year, 0, 1), $lte: new Date(year, 11, 31) };
    }
    if (month && year) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59);
      match['pay_period_start'] = { $gte: start, $lte: end };
    }

    if (viewBy === 'trend') {
      const runs = await PayrollRun.find({
        company: new mongoose.Types.ObjectId(companyId),
        status: 'posted'
      }).sort({ pay_period_start: 1 }).lean();

      return runs.map((r) => ({
        period: `${r.pay_period_start.getFullYear()}-${String(r.pay_period_start.getMonth() + 1).padStart(2, '0')}`,
        total_gross: r.total_gross || 0,
        direct: r.lines.reduce((s, l) => s + (l.direct_amount || 0), 0),
        indirect: r.lines.reduce((s, l) => s + (l.indirect_amount || 0), 0),
        employee_count: r.employee_count || 0
      }));
    }

    if (viewBy === 'account') {
      const runs = await PayrollRun.find(match).lean();
      let directTotal = 0;
      let indirectTotal = 0;
      let rssbTotal = 0;
      for (const r of runs) {
        for (const l of r.lines || []) {
          directTotal += l.direct_amount || 0;
          indirectTotal += l.indirect_amount || 0;
          rssbTotal += l.rssb_employer_total || 0;
        }
      }
      return {
        accounts: [
          { accountCode: '5300', accountName: 'Direct Labor', amount: directTotal },
          { accountCode: '5400', accountName: 'Salaries & Wages', amount: indirectTotal },
          { accountCode: '6150', accountName: 'RSSB Employer Cost', amount: rssbTotal }
        ],
        total: directTotal + indirectTotal + rssbTotal
      };
    }

    if (viewBy === 'department') {
      const runs = await PayrollRun.find(match).lean();
      const deptMap = {};
      // Collect employee_ref_ids that need department lookup
      const empIdsToLookup = new Set();
      for (const r of runs) {
        for (const l of r.lines || []) {
          if (!l.employee_department && l.employee_ref_id) {
            empIdsToLookup.add(l.employee_ref_id.toString());
          }
        }
      }
      // Batch lookup departments for missing lines
      const empDeptMap = {};
      if (empIdsToLookup.size > 0) {
        const employees = await Employee.find({
          _id: { $in: Array.from(empIdsToLookup).map((id) => new mongoose.Types.ObjectId(id)) },
        }).select('department').lean();
        for (const emp of employees) {
          empDeptMap[emp._id.toString()] = emp.department || 'Unassigned';
        }
      }
      for (const r of runs) {
        for (const l of r.lines || []) {
          const dept = l.employee_department || empDeptMap[l.employee_ref_id?.toString()] || 'Unassigned';
          if (!deptMap[dept]) deptMap[dept] = { department: dept, direct: 0, indirect: 0, count: 0 };
          deptMap[dept].direct += l.direct_amount || 0;
          deptMap[dept].indirect += l.indirect_amount || 0;
          deptMap[dept].count += 1;
        }
      }
      return Object.values(deptMap).sort((a, b) => b.direct + b.indirect - a.direct - a.indirect);
    }

    // Default: viewBy === 'employee'
    const runs = await PayrollRun.find(match).lean();
    const empMap = {};
    for (const r of runs) {
      for (const l of r.lines || []) {
        const key = l.employee_id;
        if (!empMap[key]) {
          empMap[key] = {
            employee_id: l.employee_id,
            employee_name: l.employee_name,
            labor_type: l.labor_type,
            direct: 0,
            indirect: 0,
            gross: 0,
            periods: []
          };
        }
        empMap[key].direct += l.direct_amount || 0;
        empMap[key].indirect += l.indirect_amount || 0;
        empMap[key].gross += l.gross_salary || 0;
        empMap[key].periods.push({
          period: `${r.pay_period_start.getFullYear()}-${String(r.pay_period_start.getMonth() + 1).padStart(2, '0')}`,
          direct: l.direct_amount,
          indirect: l.indirect_amount,
          source: l.allocation_source
        });
      }
    }
    return Object.values(empMap).sort((a, b) => b.gross - a.gross);
  }

  /**
   * Payroll audit trail for labor allocations
   */
  static async getAuditTrail(companyId, payrollRunId = null) {
    const match = { company: new mongoose.Types.ObjectId(companyId) };
    if (payrollRunId) match._id = new mongoose.Types.ObjectId(payrollRunId);

    const runs = await PayrollRun.find(match)
      .sort({ createdAt: -1 })
      .populate('posted_by', 'name email')
      .lean();

    return runs.map((r) => ({
      payroll_run_id: r._id,
      reference_no: r.reference_no,
      period_start: r.pay_period_start,
      period_end: r.pay_period_end,
      status: r.status,
      posted_by: r.posted_by,
      posted_at: r.updatedAt,
      warnings: r.warnings || [],
      lines: (r.lines || []).map((l) => ({
        employee_name: l.employee_name,
        employee_id: l.employee_id,
        labor_type: l.labor_type,
        gross_salary: l.gross_salary,
        direct_amount: l.direct_amount,
        indirect_amount: l.indirect_amount,
        direct_percentage: l.direct_percentage,
        indirect_percentage: l.indirect_percentage,
        allocation_source: l.allocation_source,
        timesheet_id: l.timesheet_id
      })),
      journal_entry_id: r.journal_entry_id
    }));
  }
}

module.exports = LaborCostReportService;
