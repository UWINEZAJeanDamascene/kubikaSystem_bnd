const EmployeeAdvanceService = require('../services/employeeAdvanceService');

exports.getAdvances = async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const filters = {
      status: req.query.status,
      employeeId: req.query.employeeId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: req.query.page,
      limit: req.query.limit
    };

    const result = await EmployeeAdvanceService.getAll(companyId, filters);

    res.status(200).json({
      success: true,
      data: result.advances,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAdvance = async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const advance = await EmployeeAdvanceService.getById(companyId, req.params.id);

    if (!advance) {
      return res.status(404).json({ success: false, message: 'Employee advance not found' });
    }

    res.status(200).json({ success: true, data: advance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createAdvance = async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const userId = req.user._id;

    const {
      employeeId,
      description,
      amount,
      issueDate,
      dueDate,
      paymentMethod,
      bankAccountId,
      notes
    } = req.body;

    if (!employeeId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'EMPLOYEE_AND_AMOUNT_REQUIRED: employeeId and positive amount are required'
      });
    }

    const advance = await EmployeeAdvanceService.create(companyId, userId, {
      employeeId,
      description,
      amount,
      issueDate,
      dueDate,
      paymentMethod,
      bankAccountId,
      notes
    });

    res.status(201).json({
      success: true,
      data: advance,
      message: `Employee advance of ${amount.toLocaleString()} issued successfully. Reference: ${advance.referenceNo}.`
    });
  } catch (error) {
    const status = error.message?.startsWith('EMPLOYEE_AND_AMOUNT_REQUIRED') ? 400 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

exports.recordRepayment = async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const userId = req.user._id;

    const { amount, date, paymentMethod, bankAccountId, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'REPAYMENT_AMOUNT_REQUIRED: repayment amount must be positive'
      });
    }

    const advance = await EmployeeAdvanceService.recordRepayment(
      companyId,
      userId,
      req.params.id,
      { amount, date, paymentMethod, bankAccountId, notes }
    );

    res.status(200).json({
      success: true,
      data: advance,
      message: `Repayment of ${amount.toLocaleString()} recorded. Remaining balance: ${advance.balance.toLocaleString()}.`
    });
  } catch (error) {
    let status = 500;
    if (error.message === 'ADVANCE_NOT_FOUND') status = 404;
    else if (error.message === 'ADVANCE_ALREADY_REPAID') status = 409;
    else if (error.message === 'REPAYMENT_AMOUNT_INVALID') status = 400;

    res.status(status).json({ success: false, message: error.message });
  }
};

exports.getEmployeeBalance = async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const employeeId = req.params.employeeId;

    const balance = await EmployeeAdvanceService.getEmployeeBalance(companyId, employeeId);

    res.status(200).json({ success: true, data: balance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.settleAdvance = async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const userId = req.user._id;

    const { expenseAmount, expenseAccountCode, expenseDescription, refundAmount, refundMethod, refundBankAccountId, notes, date } = req.body;

    const advance = await EmployeeAdvanceService.settleAdvance(
      companyId,
      userId,
      req.params.id,
      { expenseAmount, expenseAccountCode, expenseDescription, refundAmount, refundMethod, refundBankAccountId, notes, date }
    );

    res.status(200).json({
      success: true,
      data: advance,
      message: `Advance settled successfully. Balance cleared: ${advance.amountRepaid.toLocaleString()}.`
    });
  } catch (error) {
    let status = 500;
    if (error.message === 'ADVANCE_NOT_FOUND') status = 404;
    else if (error.message === 'ADVANCE_ALREADY_REPAID') status = 409;
    else if (error.message?.startsWith('SETTLEMENT_AMOUNT_MISMATCH')) status = 400;
    else if (error.message === 'SETTLEMENT_AMOUNT_INVALID') status = 400;

    res.status(status).json({ success: false, message: error.message });
  }
};

exports.deleteAdvance = async (req, res) => {
  try {
    const companyId = req.user.company._id;
    await EmployeeAdvanceService.delete(companyId, req.params.id);

    res.status(200).json({ success: true, message: 'Employee advance deleted successfully.' });
  } catch (error) {
    let status = 500;
    if (error.message === 'ADVANCE_NOT_FOUND') status = 404;
    else if (error.message === 'CANNOT_DELETE_REPAID_ADVANCE') status = 400;

    res.status(status).json({ success: false, message: error.message });
  }
};
