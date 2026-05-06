const ExcelJS = require('exceljs');
const { parse } = require('csv-parse/sync');
const Budget = require('../models/Budget');
const BudgetLine = require('../models/BudgetLine');
const ChartOfAccount = require('../models/ChartOfAccount');
const Department = require('../models/Department');
const mongoose = require('mongoose');

/**
 * Budget Import Service
 * Handles importing budgets from Excel and CSV files
 */
class BudgetImportService {

  /**
   * Parse uploaded file (Excel or CSV) and return structured data
   * @param {Buffer} fileBuffer - The uploaded file buffer
   * @param {string} fileType - 'excel' or 'csv'
   * @returns {Promise<Object>} Parsed data with validation info
   */
  static async parseFile(fileBuffer, fileType) {
    if (fileType === 'csv' || fileType === 'text/csv') {
      return this._parseCSV(fileBuffer);
    } else {
      return this._parseExcel(fileBuffer);
    }
  }

  /**
   * Parse Excel file
   * @private
   */
  static async _parseExcel(fileBuffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    
    const result = {
      budgets: [],
      lines: [],
      errors: [],
      warnings: []
    };

    // Expected sheet names
    const budgetSheet = workbook.getWorksheet('Budget') || workbook.getWorksheet(1);
    const linesSheet = workbook.getWorksheet('Budget Lines') || workbook.getWorksheet(2);

    if (!budgetSheet) {
      throw new Error('EXCEL_NO_BUDGET_SHEET');
    }

    // Parse budget sheet
    const budgetHeaders = this._extractHeaders(budgetSheet.getRow(1));
    const budgetRows = [];
    
    budgetSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header
      const rowData = this._extractRowData(row, budgetHeaders);
      if (this._hasAnyValue(rowData)) {
        budgetRows.push({ ...rowData, rowNumber });
      }
    });

    // Parse budget lines sheet
    if (linesSheet) {
      const lineHeaders = this._extractHeaders(linesSheet.getRow(1));
      
      linesSheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        const rowData = this._extractRowData(row, lineHeaders);
        if (this._hasAnyValue(rowData)) {
          result.lines.push({ ...rowData, rowNumber });
        }
      });
    }

    result.budgets = budgetRows;
    return result;
  }

  /**
   * Parse CSV file
   * @private
   */
  static async _parseCSV(fileBuffer) {
    const content = fileBuffer.toString('utf-8');
    
    // Detect if it's budget lines or budget header
    const lines = content.split('\n');
    const firstLine = lines[0].toLowerCase();
    
    const isBudgetLines = firstLine.includes('account') || 
                          firstLine.includes('month') || 
                          firstLine.includes('line');

    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    if (isBudgetLines) {
      return {
        budgets: [],
        lines: records.map((r, i) => ({ ...r, rowNumber: i + 2 })),
        errors: [],
        warnings: []
      };
    } else {
      return {
        budgets: records.map((r, i) => ({ ...r, rowNumber: i + 2 })),
        lines: [],
        errors: [],
        warnings: []
      };
    }
  }

  /**
   * Extract headers from Excel row
   * @private
   */
  static _extractHeaders(headerRow) {
    const headers = [];
    headerRow.eachCell((cell, colNumber) => {
      const value = cell.value?.toString()?.trim()?.toLowerCase();
      if (value) {
        headers.push({
          original: cell.value.toString().trim(),
          normalized: this._normalizeHeader(value),
          colNumber
        });
      }
    });
    return headers;
  }

  /**
   * Normalize header name for mapping
   * @private
   */
  static _normalizeHeader(header) {
    const mappings = {
      // Budget fields
      'name': 'name',
      'budget name': 'name',
      'description': 'description',
      'desc': 'description',
      'type': 'type',
      'budget type': 'type',
      'fiscal year': 'fiscal_year',
      'year': 'fiscal_year',
      'department': 'department',
      'dept': 'department',
      'period start': 'period_start',
      'start date': 'period_start',
      'start': 'period_start',
      'period end': 'period_end',
      'end date': 'period_end',
      'end': 'period_end',
      'amount': 'amount',
      'total amount': 'amount',
      'notes': 'notes',
      
      // Budget Line fields
      'account': 'account_code',
      'account code': 'account_code',
      'account id': 'account_id',
      'account name': 'account_name',
      'month': 'period_month',
      'period month': 'period_month',
      'year': 'period_year',
      'period year': 'period_year',
      'budgeted': 'budgeted_amount',
      'budgeted amount': 'budgeted_amount',
      'amount': 'budgeted_amount',
      'category': 'category',
      'line notes': 'notes',
      'line description': 'notes'
    };

    return mappings[header] || header.replace(/\s+/g, '_');
  }

  /**
   * Extract row data based on headers
   * @private
   */
  static _extractRowData(row, headers) {
    const data = {};
    headers.forEach(header => {
      const cell = row.getCell(header.colNumber);
      let value = cell.value;
      
      // Handle different cell types
      if (value && typeof value === 'object') {
        if (value.formula) {
          value = value.result;
        } else if (value.richText) {
          value = value.richText.map(t => t.text).join('');
        } else if (value.text) {
          value = value.text;
        }
      }
      
      // Convert dates
      if (value instanceof Date) {
        value = value.toISOString().split('T')[0];
      }
      
      data[header.normalized] = value !== null && value !== undefined ? value.toString().trim() : '';
    });
    return data;
  }

  /**
   * Check if row has any non-empty values
   * @private
   */
  static _hasAnyValue(rowData) {
    return Object.values(rowData).some(v => v && v.toString().trim() !== '');
  }

  /**
   * Validate import data against database
   * @param {string} companyId - Company ID
   * @param {Object} parsedData - Data from parseFile
   * @returns {Promise<Object>} Validation results with suggestions
   */
  static async validateImport(companyId, parsedData) {
    const validation = {
      isValid: true,
      budgets: [],
      lines: [],
      errors: [],
      warnings: [],
      suggestions: {
        accounts: [],
        departments: []
      }
    };

    // Get reference data
    const [accounts, departments] = await Promise.all([
      ChartOfAccount.find({ company: companyId, isActive: true }).lean(),
      Department.find({ company_id: companyId }).lean()
    ]);

    const accountMap = new Map(accounts.map(a => [a.code.toLowerCase(), a]));
    const accountNameMap = new Map(accounts.map(a => [a.name.toLowerCase(), a]));
    const deptMap = new Map(departments.map(d => [d.name.toLowerCase(), d]));

    validation.suggestions.accounts = accounts.map(a => ({ 
      id: a._id, 
      code: a.code, 
      name: a.name 
    }));
    validation.suggestions.departments = departments.map(d => ({ 
      id: d._id, 
      name: d.name 
    }));

    // Validate budgets
    for (const budget of parsedData.budgets) {
      const budgetValidation = await this._validateBudget(budget, companyId, deptMap);
      validation.budgets.push(budgetValidation);
      
      if (!budgetValidation.isValid) {
        validation.isValid = false;
        validation.errors.push(...budgetValidation.errors);
      }
      validation.warnings.push(...budgetValidation.warnings);
    }

    // Validate budget lines
    for (const line of parsedData.lines) {
      const lineValidation = await this._validateBudgetLine(line, companyId, accountMap, accountNameMap);
      validation.lines.push(lineValidation);
      
      if (!lineValidation.isValid) {
        validation.isValid = false;
        validation.errors.push(...lineValidation.errors);
      }
      validation.warnings.push(...lineValidation.warnings);
    }

    return validation;
  }

  /**
   * Validate a single budget row
   * @private
   */
  static _validateBudget(budget, companyId, deptMap) {
    const result = {
      raw: budget,
      isValid: true,
      errors: [],
      warnings: [],
      normalized: {}
    };

    // Required fields
    if (!budget.name || budget.name.trim() === '') {
      result.errors.push({ row: budget.rowNumber, field: 'name', message: 'Budget name is required' });
      result.isValid = false;
    } else {
      result.normalized.name = budget.name.trim();
    }

    // Fiscal year
    const fiscalYear = parseInt(budget.fiscal_year);
    if (!fiscalYear || isNaN(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
      result.errors.push({ row: budget.rowNumber, field: 'fiscal_year', message: 'Valid fiscal year (2000-2100) is required' });
      result.isValid = false;
    } else {
      result.normalized.fiscal_year = fiscalYear;
    }

    // Budget type
    const validTypes = ['expense', 'revenue', 'profit'];
    const type = (budget.type || 'expense').toLowerCase().trim();
    if (!validTypes.includes(type)) {
      result.warnings.push({ row: budget.rowNumber, field: 'type', message: `Invalid type "${type}", defaulting to "expense"` });
      result.normalized.type = 'expense';
    } else {
      result.normalized.type = type;
    }

    // Department (optional)
    if (budget.department) {
      const dept = deptMap.get(budget.department.toLowerCase());
      if (dept) {
        result.normalized.department = dept._id;
      } else {
        result.warnings.push({ row: budget.rowNumber, field: 'department', message: `Department "${budget.department}" not found, will be left blank` });
      }
    }

    // Dates
    if (budget.period_start) {
      const startDate = new Date(budget.period_start);
      if (!isNaN(startDate.getTime())) {
        result.normalized.periodStart = startDate;
      } else {
        result.warnings.push({ row: budget.rowNumber, field: 'period_start', message: `Invalid start date "${budget.period_start}"` });
      }
    }

    if (budget.period_end) {
      const endDate = new Date(budget.period_end);
      if (!isNaN(endDate.getTime())) {
        result.normalized.periodEnd = endDate;
      } else {
        result.warnings.push({ row: budget.rowNumber, field: 'period_end', message: `Invalid end date "${budget.period_end}"` });
      }
    }

    // Amount
    if (budget.amount) {
      const amount = parseFloat(budget.amount.replace(/[^\d.-]/g, ''));
      if (!isNaN(amount)) {
        result.normalized.amount = amount;
      }
    }

    result.normalized.description = budget.description || '';
    result.normalized.notes = budget.notes || '';

    return result;
  }

  /**
   * Validate a single budget line
   * @private
   */
  static _validateBudgetLine(line, companyId, accountMap, accountNameMap) {
    const result = {
      raw: line,
      isValid: true,
      errors: [],
      warnings: [],
      normalized: {}
    };

    // Account lookup
    let account = null;
    if (line.account_code) {
      account = accountMap.get(line.account_code.toLowerCase());
    } else if (line.account_name) {
      account = accountNameMap.get(line.account_name.toLowerCase());
    }

    if (!account) {
      result.errors.push({ 
        row: line.rowNumber, 
        field: 'account', 
        message: `Account not found: ${line.account_code || line.account_name}. Please use valid account code or name.` 
      });
      result.isValid = false;
    } else {
      result.normalized.account_id = account._id.toString();
      result.normalized.account_code = account.code;
      result.normalized.account_name = account.name;
    }

    // Period month
    const month = parseInt(line.period_month);
    if (!month || isNaN(month) || month < 1 || month > 12) {
      result.errors.push({ row: line.rowNumber, field: 'period_month', message: 'Month must be 1-12' });
      result.isValid = false;
    } else {
      result.normalized.period_month = month;
    }

    // Period year
    const year = parseInt(line.period_year);
    if (!year || isNaN(year) || year < 2000 || year > 2100) {
      result.errors.push({ row: line.rowNumber, field: 'period_year', message: 'Valid year (2000-2100) is required' });
      result.isValid = false;
    } else {
      result.normalized.period_year = year;
    }

    // Budgeted amount
    if (line.budgeted_amount) {
      const amount = parseFloat(line.budgeted_amount.replace(/[^\d.-]/g, ''));
      if (isNaN(amount)) {
        result.errors.push({ row: line.rowNumber, field: 'budgeted_amount', message: 'Invalid amount format' });
        result.isValid = false;
      } else {
        result.normalized.budgeted_amount = amount;
      }
    } else {
      result.errors.push({ row: line.rowNumber, field: 'budgeted_amount', message: 'Budgeted amount is required' });
      result.isValid = false;
    }

    result.normalized.category = line.category || '';
    result.normalized.notes = line.notes || '';

    return result;
  }

  /**
   * Execute the import after validation
   * @param {string} companyId - Company ID
   * @param {string} userId - User performing the import
   * @param {Object} validatedData - Data from validateImport
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Import results
   */
  static async executeImport(companyId, userId, validatedData, options = {}) {
    const results = {
      budgetsCreated: 0,
      budgetsUpdated: 0,
      linesCreated: 0,
      linesUpdated: 0,
      errors: [],
      budgets: []
    };

    const { 
      createMissingAccounts = false,
      skipErrors = false,
      defaultFiscalYear = new Date().getFullYear()
    } = options;

    // Import budgets
    for (const budgetData of validatedData.budgets) {
      if (!budgetData.isValid && !skipErrors) {
        results.errors.push({ type: 'budget', data: budgetData, message: 'Validation failed' });
        continue;
      }

      try {
        // Check for existing budget
        const existingBudget = await Budget.findOne({
          company_id: companyId,
          fiscal_year: budgetData.normalized.fiscal_year,
          name: budgetData.normalized.name
        });

        let budget;
        if (existingBudget && options.updateExisting) {
          // Update existing
          Object.assign(existingBudget, {
            description: budgetData.normalized.description,
            type: budgetData.normalized.type,
            department: budgetData.normalized.department,
            periodStart: budgetData.normalized.periodStart,
            periodEnd: budgetData.normalized.periodEnd,
            amount: budgetData.normalized.amount || existingBudget.amount,
            notes: budgetData.normalized.notes
          });
          budget = await existingBudget.save();
          results.budgetsUpdated++;
        } else if (!existingBudget) {
          // Create new
          budget = new Budget({
            company_id: companyId,
            name: budgetData.normalized.name,
            description: budgetData.normalized.description,
            type: budgetData.normalized.type,
            fiscal_year: budgetData.normalized.fiscal_year,
            department: budgetData.normalized.department,
            periodStart: budgetData.normalized.periodStart,
            periodEnd: budgetData.normalized.periodEnd,
            amount: budgetData.normalized.amount || 0,
            notes: budgetData.normalized.notes,
            status: 'draft',
            created_by: userId
          });
          await budget.save();
          results.budgetsCreated++;
          results.budgets.push(budget);
        } else {
          results.errors.push({ 
            type: 'budget', 
            name: budgetData.normalized.name, 
            message: 'Budget already exists (use updateExisting to overwrite)' 
          });
          continue;
        }

        // Store budget reference for lines
        budgetData._id = budget._id;
      } catch (error) {
        results.errors.push({ type: 'budget', data: budgetData, message: error.message });
      }
    }

    // Import budget lines
    for (const lineData of validatedData.lines) {
      if (!lineData.isValid && !skipErrors) {
        results.errors.push({ type: 'line', data: lineData, message: 'Validation failed' });
        continue;
      }

      try {
        // Find or create budget for this line
        let budgetId = lineData.normalized.budget_id;
        
        if (!budgetId && lineData.raw.budget_name) {
          const budget = await Budget.findOne({
            company_id: companyId,
            name: lineData.raw.budget_name,
            fiscal_year: lineData.normalized.period_year
          });
          if (budget) {
            budgetId = budget._id;
          }
        }

        if (!budgetId) {
          results.errors.push({ 
            type: 'line', 
            account: lineData.normalized.account_code,
            message: 'No budget found for this line' 
          });
          continue;
        }

        // Use atomic upsert to avoid race conditions and duplicate key errors
        const filter = {
          company_id: companyId,
          budget_id: budgetId,
          account_id: lineData.normalized.account_id,
          period_month: lineData.normalized.period_month,
          period_year: lineData.normalized.period_year
        };

        const update = {
          $set: {
            budgeted_amount: lineData.normalized.budgeted_amount,
            category: lineData.normalized.category || '',
            notes: lineData.normalized.notes || ''
          }
        };

        const result = await BudgetLine.findOneAndUpdate(filter, update, {
          upsert: true,
          new: true,
          rawResult: true
        });

        // Check if it was created or updated
        if (result.lastErrorObject?.updatedExisting) {
          results.linesUpdated++;
        } else if (result.lastErrorObject?.upserted) {
          results.linesCreated++;
        } else if (result.ok) {
          // Fallback - count as updated
          results.linesUpdated++;
        }
      } catch (error) {
        results.errors.push({ type: 'line', data: lineData, message: error.message });
      }
    }

    return results;
  }

  /**
   * Generate import template
   * @param {string} format - 'excel' or 'csv'
   * @returns {Promise<Buffer>} Template file buffer
   */
  static async generateTemplate(format = 'excel') {
    if (format === 'csv') {
      const headers = [
        'name',
        'description',
        'type',
        'fiscal_year',
        'department',
        'period_start',
        'period_end',
        'amount',
        'notes'
      ].join(',');
      
      const sampleRow = [
        '"Operating Budget 2025"',
        '"Annual operating expenses"',
        '"expense"',
        '2025',
        '"Operations"',
        '"2025-01-01"',
        '"2025-12-31"',
        '100000',
        '"Enter notes here"'
      ].join(',');

      return Buffer.from(`${headers}\n${sampleRow}`);
    } else {
      const workbook = new ExcelJS.Workbook();
      
      // Budget sheet
      const budgetSheet = workbook.addWorksheet('Budget');
      budgetSheet.columns = [
        { header: 'name', key: 'name', width: 25 },
        { header: 'description', key: 'description', width: 30 },
        { header: 'type', key: 'type', width: 12 },
        { header: 'fiscal_year', key: 'fiscal_year', width: 12 },
        { header: 'department', key: 'department', width: 15 },
        { header: 'period_start', key: 'period_start', width: 15 },
        { header: 'period_end', key: 'period_end', width: 15 },
        { header: 'amount', key: 'amount', width: 15 },
        { header: 'notes', key: 'notes', width: 30 }
      ];
      
      // Add sample row
      budgetSheet.addRow({
        name: 'Operating Budget 2025',
        description: 'Annual operating expenses',
        type: 'expense',
        fiscal_year: 2025,
        department: 'Operations',
        period_start: '2025-01-01',
        period_end: '2025-12-31',
        amount: 100000,
        notes: 'Enter notes here'
      });

      // Budget Lines sheet
      const linesSheet = workbook.addWorksheet('Budget Lines');
      linesSheet.columns = [
        { header: 'budget_name', key: 'budget_name', width: 25 },
        { header: 'account_code', key: 'account_code', width: 15 },
        { header: 'account_name', key: 'account_name', width: 25 },
        { header: 'period_month', key: 'period_month', width: 12 },
        { header: 'period_year', key: 'period_year', width: 12 },
        { header: 'budgeted_amount', key: 'budgeted_amount', width: 15 },
        { header: 'category', key: 'category', width: 15 },
        { header: 'notes', key: 'notes', width: 30 }
      ];
      
      // Add sample rows for each month
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      months.forEach((month, idx) => {
        linesSheet.addRow({
          budget_name: 'Operating Budget 2025',
          account_code: '6000',
          account_name: 'Salaries & Wages',
          period_month: idx + 1,
          period_year: 2025,
          budgeted_amount: 50000,
          category: 'Personnel',
          notes: `${month} budget`
        });
      });

      // Add instructions sheet
      const instructionsSheet = workbook.addWorksheet('Instructions');
      instructionsSheet.columns = [{ width: 80 }];
      const instructions = [
        ['BUDGET IMPORT TEMPLATE - INSTRUCTIONS'],
        [''],
        ['Budget Sheet:'],
        ['- name (required): Budget name, must be unique per fiscal year'],
        ['- description: Optional description of the budget'],
        ['- type: One of: expense, revenue, profit (default: expense)'],
        ['- fiscal_year (required): 4-digit year (e.g., 2025)'],
        ['- department: Optional department name (must exist in system)'],
        ['- period_start: Budget start date (YYYY-MM-DD)'],
        ['- period_end: Budget end date (YYYY-MM-DD)'],
        ['- amount: Total budget amount (optional, calculated from lines)'],
        ['- notes: Any additional notes'],
        [''],
        ['Budget Lines Sheet:'],
        ['- budget_name: Name of budget to associate lines with'],
        ['- account_code OR account_name (required): Must match existing chart of accounts'],
        ['- period_month (required): Month number 1-12'],
        ['- period_year (required): 4-digit year'],
        ['- budgeted_amount (required): Amount for this account/month'],
        ['- category: Optional category for grouping'],
        ['- notes: Optional line notes'],
        [''],
        ['Tips:'],
        ['- You can import budgets with or without lines'],
        ['- Lines will be matched to budgets by budget_name + period_year'],
        ['- Duplicate lines (same account + month + year) will be updated, not duplicated'],
        ['- Download your chart of accounts from Settings > Chart of Accounts']
      ];
      instructions.forEach(row => instructionsSheet.addRow(row));

      return await workbook.xlsx.writeBuffer();
    }
  }
}

module.exports = BudgetImportService;
