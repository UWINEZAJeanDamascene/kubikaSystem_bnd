const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const dateAt = (isoDate, hour = 10) => new Date(`${isoDate}T${String(hour).padStart(2, '0')}:00:00.000Z`);
const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

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
  const Category = require('../models/Category');
  const Product = require('../models/Product');
  const Warehouse = require('../models/Warehouse');
  const Supplier = require('../models/Supplier');
  const Client = require('../models/Client');
  const Invoice = require('../models/Invoice');
  const SalesOrder = require('../models/SalesOrder');
  const Purchase = require('../models/Purchase');
  const PurchaseOrder = require('../models/PurchaseOrder');
  const GoodsReceivedNote = require('../models/GoodsReceivedNote');
  const BankAccountModule = require('../models/BankAccount');
  const BankAccount = BankAccountModule.BankAccount || BankAccountModule;
  const BankTransaction = BankAccountModule.BankTransaction;
  const Payroll = require('../models/Payroll');
  const WeeklyReportsService = require('../services/weeklyReportsService');
  const weeklyRoutes = require('../routes/weeklyReportsRoutes');
  const ExcelFormatter = require('../src/exports/formatters/ExcelFormatter');
  const pdfRenderer = require('../utils/pdfRenderer');

  const company = await Company.create({ name: 'Weekly Report Test Co', code: 'WRTC', tax_identification_number: '999999998', base_currency: 'RWF' });
  const otherCompany = await Company.create({ name: 'Other Co', code: 'OTHR', base_currency: 'RWF' });
  const userId = new mongoose.Types.ObjectId();
  const weekStart = '2026-05-18';
  const thisWeekDay = dateAt('2026-05-19');
  const lastWeekDay = dateAt('2026-05-12');

  const category = await Category.create({ company: company._id, name: 'Inventory', createdBy: userId });
  const supplier = await Supplier.create({ company: company._id, name: 'Supplier One', code: 'SUP1', createdBy: userId });
  const client = await Client.create({ company: company._id, name: 'Client One', code: 'CLI1', createdBy: userId });
  const warehouse = await Warehouse.create({ company: company._id, name: 'Main Warehouse', code: 'MAIN', createdBy: userId, isDefault: true });
  const product = await Product.create({ company: company._id, name: 'Weekly Widget', sku: 'WEEK-WIDGET', category: category._id, unit: 'pcs', currentStock: 0, reorderPoint: 5, reorderQuantity: 10, preferredSupplier: supplier._id, createdBy: userId });
  const warningProduct = await Product.create({ company: company._id, name: 'Low Widget', sku: 'LOW-WIDGET', category: category._id, unit: 'pcs', currentStock: 3, reorderPoint: 5, reorderQuantity: 8, preferredSupplier: supplier._id, createdBy: userId });
  await Product.create({ company: otherCompany._id, name: 'Other Widget', sku: 'OTHER-WIDGET', category: category._id, unit: 'pcs', currentStock: 0, reorderPoint: 100, createdBy: userId });

  await Invoice.create({ company: company._id, client: client._id, referenceNo: 'INV-WEEK', status: 'fully_paid', invoiceDate: thisWeekDay, dueDate: thisWeekDay, amountPaid: 1180, lines: [{ product: product._id, productName: 'Weekly Widget', productCode: 'WEEK-WIDGET', qty: 2, unitPrice: 500, taxCode: 'B', taxRate: 18 }] });
  await Invoice.create({ company: company._id, client: client._id, referenceNo: 'INV-LAST', status: 'fully_paid', invoiceDate: lastWeekDay, dueDate: lastWeekDay, amountPaid: 590, lines: [{ product: product._id, productName: 'Weekly Widget', productCode: 'WEEK-WIDGET', qty: 1, unitPrice: 500, taxCode: 'B', taxRate: 18 }] });
  await Invoice.create({ company: company._id, client: client._id, referenceNo: 'INV-AGING', status: 'confirmed', invoiceDate: daysAgo(3), dueDate: daysAgo(3), lines: [{ product: warningProduct._id, productName: 'Low Widget', productCode: 'LOW-WIDGET', qty: 1, unitPrice: 500, taxCode: 'B', taxRate: 18 }] });
  await Invoice.create({ company: otherCompany._id, client: client._id, referenceNo: 'INV-OTHER', status: 'fully_paid', invoiceDate: thisWeekDay, dueDate: thisWeekDay, amountPaid: 999, lines: [{ product: product._id, productName: 'Other', qty: 1, unitPrice: 999 }] });

  await SalesOrder.create({ company: company._id, client: client._id, orderDate: thisWeekDay, status: 'delivered', currencyCode: 'RWF', createdBy: userId, lines: [{ product: product._id, qty: 2, qtyDelivered: 2, unitPrice: 500, taxRate: 18 }] });
  await SalesOrder.create({ company: company._id, client: client._id, orderDate: lastWeekDay, status: 'delivered', currencyCode: 'RWF', createdBy: userId, lines: [{ product: product._id, qty: 1, qtyDelivered: 1, unitPrice: 500, taxRate: 18 }] });

  const po = await PurchaseOrder.create({ company: company._id, supplier: supplier._id, warehouse: warehouse._id, orderDate: thisWeekDay, expectedDeliveryDate: daysAgo(1), status: 'approved', currencyCode: 'RWF', createdBy: userId, lines: [{ product: product._id, qtyOrdered: 10, qtyReceived: 0, unitCost: 50 }] });
  await GoodsReceivedNote.create({ company: company._id, referenceNo: 'GRN-WEEK', purchaseOrder: po._id, warehouse: warehouse._id, supplier: supplier._id, receivedDate: thisWeekDay, status: 'confirmed', totalAmount: 300, lines: [{ product: product._id, qtyReceived: 6, unitCost: 50 }] });
  await Purchase.create({ company: company._id, supplier: supplier._id, warehouse: warehouse._id, purchaseNumber: 'PUR-AGING', status: 'received', purchaseDate: daysAgo(10), supplierInvoiceDate: daysAgo(10), createdBy: userId, items: [{ product: product._id, quantity: 10, unitCost: 100, taxCode: 'B', taxRate: 18 }] });

  const bank = await BankAccount.create({ company: company._id, name: 'Main Bank', accountNumber: '001', bankName: 'BK', currencyCode: 'RWF', ledgerAccountId: '1100', openingBalance: 1000, openingBalanceDate: lastWeekDay, isActive: true, accountType: 'bk_bank' });
  await BankTransaction.create({ company: company._id, account: bank._id, type: 'deposit', amount: 1000, balanceAfter: 2000, date: thisWeekDay, description: 'Weekly receipt', createdBy: userId });
  await BankTransaction.create({ company: company._id, account: bank._id, type: 'withdrawal', amount: 300, balanceAfter: 1700, date: dateAt('2026-05-20'), description: 'Weekly payment', createdBy: userId });

  const payrollCalcA = Payroll.calculatePayroll({ basicSalary: 500000 });
  const payrollCalcB = Payroll.calculatePayroll({ basicSalary: 300000 });
  await Payroll.create({
    company: company._id,
    employee: { employeeId: 'EMP-001', firstName: 'Aline', lastName: 'K', department: 'Finance' },
    salary: { basicSalary: 500000, grossSalary: payrollCalcA.grossSalary },
    deductions: payrollCalcA.deductions,
    contributions: payrollCalcA.contributions,
    netPay: payrollCalcA.netPay,
    period: { month: new Date().getMonth() + 1, year: new Date().getFullYear(), monthName: 'Current' },
    pay_period_start: daysAgo(3),
    pay_period_end: daysAgo(-20),
    record_status: 'draft'
  });
  await Payroll.create({
    company: company._id,
    employee: { employeeId: 'EMP-002', firstName: 'Eric', lastName: 'M', department: 'Sales' },
    salary: { basicSalary: 300000, grossSalary: payrollCalcB.grossSalary },
    deductions: payrollCalcB.deductions,
    contributions: payrollCalcB.contributions,
    netPay: payrollCalcB.netPay,
    period: { month: new Date().getMonth() + 1, year: new Date().getFullYear(), monthName: 'Current' },
    pay_period_start: daysAgo(3),
    pay_period_end: daysAgo(-20),
    record_status: 'draft'
  });

  const reports = {
    sales: await WeeklyReportsService.getWeeklySalesPerformance(company._id, weekStart),
    reorder: await WeeklyReportsService.getWeeklyInventoryReorder(company._id),
    suppliers: await WeeklyReportsService.getWeeklySupplierPerformance(company._id, weekStart),
    receivables: await WeeklyReportsService.getWeeklyReceivablesAging(company._id),
    payables: await WeeklyReportsService.getWeeklyPayablesAging(company._id),
    cashFlow: await WeeklyReportsService.getWeeklyCashFlow(company._id, weekStart),
    payroll: await WeeklyReportsService.getWeeklyPayrollPreview(company._id)
  };

  const routePaths = weeklyRoutes.stack
    .filter(layer => layer.route)
    .map(layer => `${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`);
  const requiredRoutes = [
    '/sales-performance/pdf', '/sales-performance/excel',
    '/inventory-reorder/pdf', '/inventory-reorder/excel',
    '/supplier-performance/pdf', '/supplier-performance/excel',
    '/receivables-aging/pdf', '/receivables-aging/excel',
    '/payables-aging/pdf', '/payables-aging/excel',
    '/cash-flow/pdf', '/cash-flow/excel',
    '/payroll-preview/pdf', '/payroll-preview/excel'
  ];

  const checks = [
    ['weekly export routes', requiredRoutes.every(path => routePaths.some(route => route.endsWith(` ${path}`)))],
    ['sales this/last week', reports.sales.thisWeek.sales === 1180 && reports.sales.lastWeek.sales === 590 && reports.sales.thisWeek.items === 2 && reports.sales.lastWeek.items === 1],
    ['reorder critical/warning', reports.reorder.summary.criticalCount === 1 && reports.reorder.summary.warningCount === 1],
    ['supplier activity', reports.suppliers.summary.totalPosRaised === 1 && reports.suppliers.summary.totalDeliveries === 1 && reports.suppliers.summary.totalPending === 1 && reports.suppliers.summary.totalOverdue === 1],
    ['receivables aging', reports.receivables.summary.totalInvoices === 1 && reports.receivables.summary.totalOutstanding === 590],
    ['payables aging', reports.payables.summary.totalPurchases === 1 && reports.payables.summary.totalPayable === 1180],
    ['cash flow', reports.cashFlow.summary.weekTotalIn === 1000 && reports.cashFlow.summary.weekTotalOut === 300 && reports.cashFlow.summary.weekNetFlow === 700],
    ['payroll preview', reports.payroll.payrollInProgress === true && reports.payroll.summary.employeeCount === 2 && reports.payroll.summary.grossPay === 800000]
  ];

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length > 0) {
    console.error(JSON.stringify(reports, null, 2));
    console.error(routePaths.join('\n'));
    throw new Error(`Weekly report checks failed: ${failed.map(([name]) => name).join(', ')}`);
  }

  const exportSpecs = [
    ['Weekly Sales Performance', `${reports.sales.weekStart} to ${reports.sales.weekEnd}`, [{ label: 'This Week Sales', value: reports.sales.thisWeek.sales }, { label: 'Last Week Sales', value: reports.sales.lastWeek.sales }]],
    ['Weekly Inventory Reorder', 'Current stock position', [{ label: 'Critical', value: reports.reorder.summary.criticalCount }, { label: 'Warning', value: reports.reorder.summary.warningCount }]],
    ['Weekly Supplier Performance', `${reports.suppliers.weekStart} to ${reports.suppliers.weekEnd}`, [{ label: 'POs Raised', value: reports.suppliers.summary.totalPosRaised }, { label: 'Deliveries', value: reports.suppliers.summary.totalDeliveries }]],
    ['Weekly Receivables Aging', 'Current outstanding receivables', [{ label: 'Invoices', value: reports.receivables.summary.totalInvoices }, { label: 'Outstanding', value: reports.receivables.summary.totalOutstanding }]],
    ['Weekly Payables Aging', 'Current outstanding payables', [{ label: 'Bills', value: reports.payables.summary.totalPurchases }, { label: 'Payable', value: reports.payables.summary.totalPayable }]],
    ['Weekly Cash Flow', `${reports.cashFlow.weekStart} to ${reports.cashFlow.weekEnd}`, [{ label: 'Cash In', value: reports.cashFlow.summary.weekTotalIn }, { label: 'Cash Out', value: reports.cashFlow.summary.weekTotalOut }]],
    ['Weekly Payroll Preview', `${reports.payroll.periodStart} to ${reports.payroll.periodEnd}`, [{ label: 'Employees', value: reports.payroll.summary.employeeCount }, { label: 'Gross Pay', value: reports.payroll.summary.grossPay }]]
  ];

  const pdfBuffers = [];
  const excelBuffers = [];
  for (const [title, period, rows] of exportSpecs) {
    const pdf = await collectPdf({ company, title, period, rows, pdfRenderer });
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

  console.log('weekly-report-service-ok');
  console.log(JSON.stringify({
    sales: reports.sales.thisWeek,
    reorder: reports.reorder.summary,
    suppliers: reports.suppliers.summary,
    receivables: reports.receivables.summary,
    payables: reports.payables.summary,
    cashFlow: reports.cashFlow.summary,
    payroll: reports.payroll.summary
  }, null, 2));
  console.log(`pdf-bytes=${pdfBuffers.join(',')}`);
  console.log(`excel-bytes=${excelBuffers.join(',')}`);

  await mongoose.disconnect();
  await mongod.stop();
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
