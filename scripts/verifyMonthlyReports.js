const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const d = (iso) => new Date(`${iso}T10:00:00.000Z`);

const collectPdf = async ({ company, title, period, rows, pdfRenderer }) => {
  const chunks = [];
  const doc = new PDFDocument({ margin: 30 });
  doc.on('data', chunk => chunks.push(chunk));
  const done = new Promise(resolve => doc.on('end', resolve));
  pdfRenderer.renderReportHeader(doc, {
    companyName: company.name,
    companyTin: company.tax_identification_number,
    reportTitle: title,
    period
  });
  pdfRenderer.renderSummarySection(doc, rows);
  doc.end();
  await done;
  return Buffer.concat(chunks);
};

async function main() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const Company = require('../models/Company');
  const ChartOfAccount = require('../models/ChartOfAccount');
  require('../models/AccountBalance');
  const Category = require('../models/Category');
  const Product = require('../models/Product');
  const Warehouse = require('../models/Warehouse');
  const Supplier = require('../models/Supplier');
  const Client = require('../models/Client');
  const Invoice = require('../models/Invoice');
  const Purchase = require('../models/Purchase');
  const PurchaseOrder = require('../models/PurchaseOrder');
  const StockMovement = require('../models/StockMovement');
  const JournalEntry = require('../models/JournalEntry');
  const Expense = require('../models/Expense');
  const Payroll = require('../models/Payroll');
  const Budget = require('../models/Budget');
  const BankAccountModule = require('../models/BankAccount');
  const BankAccount = BankAccountModule.BankAccount || BankAccountModule;
  const BankTransaction = BankAccountModule.BankTransaction;
  const BankStatementLine = BankAccountModule.BankStatementLine;
  const MonthlyReportsService = require('../services/monthlyReportsService');
  const monthlyRoutes = require('../routes/monthlyReportsRoutes');
  const ExcelFormatter = require('../src/exports/formatters/ExcelFormatter');
  const pdfRenderer = require('../utils/pdfRenderer');

  const year = 2026;
  const month = 5;
  const company = await Company.create({ name: 'Monthly Report Test Co', code: 'MRTC', tax_identification_number: '999999997', base_currency: 'RWF' });
  const otherCompany = await Company.create({ name: 'Other Co', code: 'OTHR', base_currency: 'RWF' });
  const userId = new mongoose.Types.ObjectId();

  const accounts = [
    ['1100', 'Main Bank', 'asset'], ['1300', 'Accounts Receivable', 'asset'], ['1400', 'Inventory', 'asset'],
    ['1700', 'Equipment', 'asset'], ['2100', 'Accounts Payable', 'liability'], ['2220', 'VAT Payable', 'liability'],
    ['2600', 'Tax Payable', 'liability'], ['3100', 'Retained Earnings', 'equity'], ['4000', 'Sales Revenue', 'revenue'],
    ['5000', 'COGS', 'cogs'], ['6100', 'Operations Expense', 'expense'], ['6200', 'Payroll Expense', 'expense']
  ];
  await ChartOfAccount.insertMany(accounts.map(([code, name, type]) => ({ company: company._id, code, name, type, isActive: true, createdBy: userId })));

  const category = await Category.create({ company: company._id, name: 'Finished Goods', createdBy: userId });
  const warehouse = await Warehouse.create({ company: company._id, name: 'Main', code: 'MAIN', isDefault: true, createdBy: userId });
  const supplier = await Supplier.create({ company: company._id, name: 'Supplier One', code: 'SUP1', createdBy: userId });
  const client = await Client.create({ company: company._id, name: 'Client One', code: 'CLI1', createdBy: userId });
  const product = await Product.create({ company: company._id, name: 'Monthly Widget', sku: 'MON-WIDGET', category: category._id, unit: 'pcs', currentStock: 10, averageCost: 100, costPrice: 100, createdBy: userId });

  await Invoice.create({
    company: company._id,
    client: client._id,
    referenceNo: 'INV-MONTH',
    status: 'partially_paid',
    invoiceDate: d('2026-05-10'),
    dueDate: d('2026-05-20'),
    amountPaid: 1000,
    lines: [{ product: product._id, productName: 'Monthly Widget', productCode: 'MON-WIDGET', qty: 2, unitPrice: 500, taxCode: 'B', taxRate: 18, unitCost: 100 }]
  });
  await Invoice.create({
    company: otherCompany._id,
    client: client._id,
    referenceNo: 'INV-OTHER-MONTH',
    status: 'fully_paid',
    invoiceDate: d('2026-05-10'),
    dueDate: d('2026-05-10'),
    amountPaid: 999,
    lines: [{ product: product._id, productName: 'Other', qty: 1, unitPrice: 999 }]
  });

  await Purchase.create({
    company: company._id,
    supplier: supplier._id,
    warehouse: warehouse._id,
    purchaseNumber: 'PUR-MONTH',
    status: 'received',
    purchaseDate: d('2026-05-08'),
    supplierInvoiceDate: d('2026-05-08'),
    supplierInvoiceNumber: 'SUP-INV-1',
    createdBy: userId,
    items: [{ product: product._id, quantity: 5, unitCost: 100, taxCode: 'B', taxRate: 18 }]
  });
  await PurchaseOrder.create({
    company: company._id,
    supplier: supplier._id,
    warehouse: warehouse._id,
    orderDate: d('2026-05-06'),
    expectedDeliveryDate: d('2026-05-16'),
    status: 'approved',
    currencyCode: 'RWF',
    createdBy: userId,
    lines: [{ product: product._id, qtyOrdered: 4, unitCost: 50, taxRate: 18 }]
  });

  await StockMovement.create({ company: company._id, product: product._id, warehouse: warehouse._id, type: 'in', reason: 'purchase', quantity: 5, unitCost: 100, totalCost: 500, movementDate: d('2026-05-08') });
  await StockMovement.create({ company: company._id, product: product._id, warehouse: warehouse._id, type: 'out', reason: 'sale', quantity: 2, unitCost: 100, totalCost: 200, movementDate: d('2026-05-10') });

  const bank = await BankAccount.create({ company: company._id, name: 'Main Bank', accountNumber: '001', bankName: 'BK', currencyCode: 'RWF', ledgerAccountId: '1100', openingBalance: 0, openingBalanceDate: d('2026-04-01'), cachedBalance: 900, isActive: true, accountType: 'bk_bank' });
  await BankTransaction.create({ company: company._id, account: bank._id, type: 'deposit', amount: 1000, balanceAfter: 1000, date: d('2026-05-12'), description: 'Customer receipt', createdBy: userId });
  await BankTransaction.create({ company: company._id, account: bank._id, type: 'withdrawal', amount: 100, balanceAfter: 900, date: d('2026-05-13'), description: 'Expense payment', createdBy: userId });
  await BankStatementLine.create({ company: company._id, bankAccount: bank._id, transactionDate: d('2026-05-31'), description: 'Closing statement', creditAmount: 1000, debitAmount: 100, balance: 900 });

  await Expense.create({ company: company._id, expense_date: d('2026-05-15'), description: 'Operations expense', expense_account_id: new mongoose.Types.ObjectId(), amount: 100, total_amount: 100, payment_method: 'cash', posted_by: userId, createdBy: userId });

  const payrollCalc = Payroll.calculatePayroll({ basicSalary: 500000 });
  await Payroll.create({
    company: company._id,
    employee: { employeeId: 'EMP-001', firstName: 'Aline', lastName: 'K', department: 'Finance' },
    salary: { basicSalary: 500000, grossSalary: payrollCalc.grossSalary },
    deductions: payrollCalc.deductions,
    contributions: payrollCalc.contributions,
    netPay: payrollCalc.netPay,
    period: { month, year, monthName: 'May' },
    pay_period_start: d('2026-05-01'),
    pay_period_end: d('2026-05-31'),
    record_status: 'finalised'
  });

  await Budget.create({ company_id: company._id, fiscal_year: year, periodStart: d('2026-05-01'), periodEnd: d('2026-05-31'), status: 'active', type: 'revenue', name: 'Revenue', category: 'Revenue', amount: 900, created_by: userId });
  await Budget.create({ company_id: company._id, fiscal_year: year, periodStart: d('2026-05-01'), periodEnd: d('2026-05-31'), status: 'active', type: 'expense', name: 'Operations', category: 'Operations', amount: 200, created_by: userId });

  const journalLines = [
    ['1100', 'Main Bank', 1000, 100],
    ['1300', 'Accounts Receivable', 1180, 1000],
    ['1400', 'Inventory', 590, 200],
    ['2100', 'Accounts Payable', 0, 590],
    ['2220', 'VAT Payable', 90, 180],
    ['4000', 'Sales Revenue', 0, 1000],
    ['5000', 'COGS', 200, 0],
    ['6100', 'Operations Expense', 100, 0],
    ['6200', 'Payroll Expense', 500000, 0],
    ['3100', 'Retained Earnings', 0, 90],
    ['2600', 'Tax Payable', 0, 500000]
  ];
  await JournalEntry.create({
    company: company._id,
    entryNumber: 'JE-MONTH',
    date: d('2026-05-31'),
    description: 'Monthly report postings',
    status: 'posted',
    createdBy: userId,
    totalDebit: 503160,
    totalCredit: 503160,
    lines: journalLines.map(([accountCode, accountName, debit, credit]) => ({ accountCode, accountName, debit, credit }))
  });

  const reports = {
    profitLoss: await MonthlyReportsService.getProfitAndLoss(company._id, year, month),
    balanceSheet: await MonthlyReportsService.getBalanceSheet(company._id, year, month),
    trialBalance: await MonthlyReportsService.getTrialBalance(company._id, year, month),
    cashFlow: await MonthlyReportsService.getCashFlowStatement(company._id, year, month),
    stockValuation: await MonthlyReportsService.getStockValuation(company._id, year, month),
    salesByCustomer: await MonthlyReportsService.getSalesByCustomer(company._id, year, month),
    salesByCategory: await MonthlyReportsService.getSalesByCategory(company._id, year, month),
    purchasesBySupplier: await MonthlyReportsService.getPurchasesBySupplier(company._id, year, month),
    arAging: await MonthlyReportsService.getARAging(company._id, year, month),
    apAging: await MonthlyReportsService.getAPAging(company._id, year, month),
    payrollSummary: await MonthlyReportsService.getPayrollSummary(company._id, year, month),
    vatReturn: await MonthlyReportsService.getVATReturn(company._id, year, month),
    bankReconciliation: await MonthlyReportsService.getBankReconciliation(company._id, year, month),
    budgetVsActual: await MonthlyReportsService.getBudgetVsActual(company._id, year, month),
    generalLedger: await MonthlyReportsService.getGeneralLedger(company._id, year, month)
  };

  const routePaths = monthlyRoutes.stack
    .filter(layer => layer.route)
    .map(layer => `${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`);
  const reportSlugs = [
    'profit-loss', 'balance-sheet', 'trial-balance', 'cash-flow', 'stock-valuation',
    'sales-by-customer', 'sales-by-category', 'purchases-by-supplier', 'ar-aging',
    'ap-aging', 'payroll-summary', 'vat-return', 'bank-reconciliation',
    'budget-vs-actual', 'general-ledger'
  ];
  const requiredRoutes = reportSlugs.flatMap(slug => [`/${slug}`, `/${slug}/pdf`, `/${slug}/excel`]);

  const checks = [
    ['monthly route coverage', requiredRoutes.every(path => routePaths.some(route => route.endsWith(` ${path}`)))],
    ['profit loss revenue/cogs', reports.profitLoss.sections[0].current === 1000 && reports.profitLoss.sections[1].current === 200],
    ['trial balance has accounts', reports.trialBalance.accounts.length >= 5 && reports.trialBalance.isBalanced],
    ['stock valuation', reports.stockValuation.summary.totalItems === 1 && reports.stockValuation.summary.totalValue === 1000],
    ['sales by customer', reports.salesByCustomer.summary.totalRevenue === 1180 && reports.salesByCustomer.summary.totalOutstanding === 180],
    ['sales by category', reports.salesByCategory.summary.totalRevenue === 1000 && reports.salesByCategory.summary.totalUnits === 2],
    ['purchases by supplier', reports.purchasesBySupplier.summary.totalSuppliers === 1 && reports.purchasesBySupplier.summary.totalSpend > 0],
    ['ar aging', reports.arAging.summary.totalAR === 180 && reports.arAging.summary.totalInvoices === 1],
    ['ap aging', reports.apAging.summary.totalAP === 590 && reports.apAging.summary.totalBills === 1],
    ['payroll summary', reports.payrollSummary.summary.totalEmployees === 1 && reports.payrollSummary.summary.totalGrossPay === 500000],
    ['vat return', reports.vatReturn.summary.totalOutputVAT === 180 && reports.vatReturn.summary.totalInputVAT >= 90],
    ['bank reconciliation', reports.bankReconciliation.accounts.length === 1 && reports.bankReconciliation.summary.totalBookBalance === 900],
    ['budget vs actual', reports.budgetVsActual.revenue.actual === 1180 && reports.budgetVsActual.expenses.length === 1],
    ['general ledger', reports.generalLedger.summary.totalTransactions >= 5]
  ];

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length > 0) {
    console.error(JSON.stringify(reports, null, 2));
    console.error(routePaths.join('\n'));
    throw new Error(`Monthly report checks failed: ${failed.map(([name]) => name).join(', ')}`);
  }

  const exportSpecs = [
    ['Profit & Loss', reports.profitLoss.period, [{ label: 'Revenue', value: reports.profitLoss.sections[0].current }]],
    ['Balance Sheet', reports.balanceSheet.asOfDate, [{ label: 'Assets', value: reports.balanceSheet.assets.current }]],
    ['Trial Balance', reports.trialBalance.asOfDate, [{ label: 'Debits', value: reports.trialBalance.totalDebits }]],
    ['Cash Flow', reports.cashFlow.period, [{ label: 'Net Cash Change', value: reports.cashFlow.summary.netCashChange }]],
    ['Stock Valuation', reports.stockValuation.asOfDate, [{ label: 'Total Value', value: reports.stockValuation.summary.totalValue }]],
    ['Sales by Customer', reports.salesByCustomer.period, [{ label: 'Revenue', value: reports.salesByCustomer.summary.totalRevenue }]],
    ['Sales by Category', reports.salesByCategory.period, [{ label: 'Revenue', value: reports.salesByCategory.summary.totalRevenue }]],
    ['Purchases by Supplier', reports.purchasesBySupplier.period, [{ label: 'Spend', value: reports.purchasesBySupplier.summary.totalSpend }]],
    ['AR Aging', reports.arAging.asOfDate, [{ label: 'Total AR', value: reports.arAging.summary.totalAR }]],
    ['AP Aging', reports.apAging.asOfDate, [{ label: 'Total AP', value: reports.apAging.summary.totalAP }]],
    ['Payroll Summary', reports.payrollSummary.period, [{ label: 'Gross Pay', value: reports.payrollSummary.summary.totalGrossPay }]],
    ['VAT Return', reports.vatReturn.taxPeriod, [{ label: 'Net VAT', value: reports.vatReturn.summary.netVATPAYABLE }]],
    ['Bank Reconciliation', reports.bankReconciliation.asOfDate, [{ label: 'Book Balance', value: reports.bankReconciliation.summary.totalBookBalance }]],
    ['Budget vs Actual', reports.budgetVsActual.period, [{ label: 'Actual Revenue', value: reports.budgetVsActual.revenue.actual }]],
    ['General Ledger', reports.generalLedger.period, [{ label: 'Transactions', value: reports.generalLedger.summary.totalTransactions }]]
  ];

  const pdfBuffers = [];
  const excelBuffers = [];
  for (const [title, period, rows] of exportSpecs) {
    const pdf = await collectPdf({ company, title: `Monthly ${title}`, period, rows, pdfRenderer });
    if (pdf.length < 1000) throw new Error(`${title} PDF buffer not generated`);
    pdfBuffers.push(pdf.length);

    const excel = await ExcelFormatter.createMultiSheet({
      Summary: {
        columns: [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Value', key: 'value', width: 18 }],
        data: rows.map(row => ({ metric: row.label, value: row.value }))
      }
    });
    if (!Buffer.isBuffer(excel) || excel.length < 1000) throw new Error(`${title} Excel buffer not generated`);
    excelBuffers.push(excel.length);
  }

  console.log('monthly-report-service-ok');
  console.log(JSON.stringify({
    profitLoss: reports.profitLoss.sections.map(s => ({ title: s.title, current: s.current })),
    trialBalance: { totalDebits: reports.trialBalance.totalDebits, totalCredits: reports.trialBalance.totalCredits, isBalanced: reports.trialBalance.isBalanced },
    salesByCustomer: reports.salesByCustomer.summary,
    arAging: reports.arAging.summary,
    apAging: reports.apAging.summary,
    payroll: reports.payrollSummary.summary,
    vat: reports.vatReturn.summary,
    routes: requiredRoutes.length
  }, null, 2));
  console.log(`pdf-count=${pdfBuffers.length} bytes=${pdfBuffers.join(',')}`);
  console.log(`excel-count=${excelBuffers.length} bytes=${excelBuffers.join(',')}`);

  await mongoose.disconnect();
  await mongod.stop();
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
