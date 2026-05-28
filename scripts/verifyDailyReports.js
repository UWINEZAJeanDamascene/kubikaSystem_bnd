const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

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
  const Purchase = require('../models/Purchase');
  const GoodsReceivedNote = require('../models/GoodsReceivedNote');
  const StockMovement = require('../models/StockMovement');
  const BankAccountModule = require('../models/BankAccount');
  const BankAccount = BankAccountModule.BankAccount || BankAccountModule;
  const BankTransaction = BankAccountModule.BankTransaction;
  const ARReceipt = require('../models/ARReceipt');
  const APPayment = require('../models/APPayment');
  const CreditNote = require('../models/CreditNote');
  const PurchaseReturn = require('../models/PurchaseReturn');
  const JournalEntry = require('../models/JournalEntry');
  const Expense = require('../models/Expense');
  const DailyReportsService = require('../services/dailyReportsService');
  const ExcelFormatter = require('../src/exports/formatters/ExcelFormatter');
  const pdfRenderer = require('../utils/pdfRenderer');

  const company = await Company.create({ name: 'Daily Report Test Co', code: 'DRTC', tax_identification_number: '999999999', base_currency: 'RWF' });
  const otherCompany = await Company.create({ name: 'Other Co', code: 'OTHR', base_currency: 'RWF' });
  const userId = new mongoose.Types.ObjectId();
  const date = '2026-05-28';
  const day = new Date('2026-05-28T10:00:00.000Z');
  const otherDay = new Date('2026-05-27T10:00:00.000Z');

  const category = await Category.create({ company: company._id, name: 'Inventory', createdBy: userId });
  const product = await Product.create({ company: company._id, name: 'Widget A', sku: 'WIDGET-A', category: category._id, unit: 'pcs', createdBy: userId });
  const warehouse = await Warehouse.create({ company: company._id, name: 'Main Warehouse', code: 'MAIN', createdBy: userId, isDefault: true });
  const supplier = await Supplier.create({ company: company._id, name: 'Supplier One', code: 'SUP1', createdBy: userId });
  const client = await Client.create({ company: company._id, name: 'Client One', code: 'CLI1', createdBy: userId });

  await Invoice.create({ company: company._id, client: client._id, referenceNo: 'INV-DAY', status: 'fully_paid', invoiceDate: day, dueDate: day, paymentMethod: 'cash', subtotal: 1000, taxAmount: 180, totalAmount: 1180, withholdingTax: 20, lines: [{ product: product._id, productName: 'Widget A', productCode: 'WIDGET-A', qty: 2, unitPrice: 500, taxCode: 'B', taxRate: 18, lineSubtotal: 1000, lineTax: 180, lineTotal: 1180 }] });
  await Invoice.create({ company: company._id, client: client._id, referenceNo: 'INV-OLD', status: 'fully_paid', invoiceDate: otherDay, dueDate: otherDay, totalAmount: 999, taxAmount: 99, lines: [{ product: product._id, productName: 'Old Widget', qty: 1, unitPrice: 999, lineTotal: 999 }] });
  await Invoice.create({ company: otherCompany._id, client: client._id, referenceNo: 'INV-OTHER', status: 'fully_paid', invoiceDate: day, dueDate: day, totalAmount: 777, taxAmount: 77, lines: [{ product: product._id, productName: 'Other Widget', qty: 1, unitPrice: 777, lineTotal: 777 }] });

  await Purchase.create({ company: company._id, supplier: supplier._id, purchaseNumber: 'PUR-DAY', status: 'received', purchaseDate: day, receivedDate: day, grandTotal: 590, totalTax: 90, totalDiscount: 0, withholdingTax: 15, createdBy: userId, items: [{ product: product._id, quantity: 1, unitCost: 500, subtotal: 500, totalWithTax: 590 }] });
  const grn = await GoodsReceivedNote.create({ company: company._id, referenceNo: 'GRN-DAY', purchaseOrder: new mongoose.Types.ObjectId(), warehouse: warehouse._id, supplier: supplier._id, receivedDate: day, status: 'confirmed', totalAmount: 300, lines: [{ product: product._id, qtyReceived: 3, unitCost: 100 }] });

  const account = await BankAccount.create({ company: company._id, name: 'Main Bank', accountNumber: '001', bankName: 'BK', currencyCode: 'RWF', ledgerAccountId: '1100', openingBalance: 1000, openingBalanceDate: otherDay, isActive: true, accountType: 'bk_bank' });
  await BankTransaction.create({ company: company._id, account: account._id, type: 'deposit', amount: 400, balanceAfter: 1400, date: day, description: 'Daily receipt', createdBy: userId });
  await BankTransaction.create({ company: company._id, account: account._id, type: 'withdrawal', amount: 100, balanceAfter: 1300, date: day, description: 'Daily payment', createdBy: userId });

  await StockMovement.create({ company: company._id, product: product._id, warehouse: warehouse._id, type: 'in', reason: 'purchase', quantity: 3, unitCost: 100, totalCost: 300, newStock: 3, movementDate: day, referenceNumber: 'GRN-DAY' });
  await StockMovement.create({ company: company._id, product: product._id, warehouse: warehouse._id, type: 'out', reason: 'sale', quantity: 1, unitCost: 100, totalCost: 100, newStock: 2, movementDate: day, referenceNumber: 'INV-DAY' });

  await ARReceipt.create({ company: company._id, client: client._id, referenceNo: 'RCP-DAY', receiptDate: day, paymentMethod: 'cash', amountReceived: 400, status: 'posted', createdBy: userId });
  await APPayment.create({ referenceNo: 'PAY-DAY', company: company._id, supplier: supplier._id, paymentDate: day, paymentMethod: 'cash', amountPaid: 200, currencyCode: 'RWF', status: 'posted', createdBy: userId });
  const invoice = await Invoice.findOne({ referenceNo: 'INV-DAY' });
  await CreditNote.create({ company: company._id, invoice: invoice._id, client: client._id, referenceNo: 'CN-DAY', creditNoteNumber: 'CN-DAY', creditDate: day, reason: 'Return', type: 'goods_return', status: 'confirmed', subtotal: 100, taxAmount: 18, totalAmount: 118, createdBy: userId, lines: [{ invoiceLineId: new mongoose.Types.ObjectId(), product: product._id, quantity: 1, unitPrice: 100, taxRate: 18, lineSubtotal: 100, lineTax: 18, lineTotal: 118 }] });
  await PurchaseReturn.create({ company: company._id, referenceNo: 'PR-DAY', grn: grn._id, supplier: supplier._id, warehouse: warehouse._id, returnDate: day, reason: 'Damaged', status: 'confirmed', totalAmount: 50, lines: [{ grnLine: grn.lines[0]._id, product: product._id, qtyReturned: 1, unitCost: 50 }] });
  await JournalEntry.create({ company: company._id, entryNumber: 'JE-DAY', date: day, description: 'Daily posting', status: 'posted', createdBy: userId, totalDebit: 1180, totalCredit: 1180, lines: [{ accountCode: '1100', accountName: 'Cash', debit: 1180, credit: 0, description: 'Cash' }, { accountCode: '4000', accountName: 'Sales', debit: 0, credit: 1000, description: 'Sales' }, { accountCode: '2220', accountName: 'VAT Output', debit: 0, credit: 180, description: 'VAT' }] });
  await Expense.create({ company: company._id, expense_date: day, description: 'WHT service', expense_account_id: new mongoose.Types.ObjectId(), amount: 100, total_amount: 100, payment_method: 'cash', rraTaxCategory: 'wht_10_interest', withholdingTax: 10, withholdingTaxRate: 10, posted_by: userId, createdBy: userId });

  const reports = {
    sales: await DailyReportsService.getDailySalesSummary(company._id, date),
    purchases: await DailyReportsService.getDailyPurchasesSummary(company._id, date),
    cash: await DailyReportsService.getDailyCashPosition(company._id, date),
    stock: await DailyReportsService.getDailyStockMovement(company._id, date),
    ar: await DailyReportsService.getDailyARActivity(company._id, date),
    ap: await DailyReportsService.getDailyAPActivity(company._id, date),
    journal: await DailyReportsService.getDailyJournalEntries(company._id, date),
    tax: await DailyReportsService.getDailyTaxCollected(company._id, date)
  };

  const checks = [
    ['sales.totalSales', reports.sales.summary.totalSales === 1180],
    ['sales.topProducts', reports.sales.topProducts[0]?.name === 'Widget A' && reports.sales.topProducts[0]?.quantity === 2],
    ['purchases.total/items', reports.purchases.summary.totalPurchases === 800 && reports.purchases.summary.totalItemsReceived === 3],
    ['cash.receipts/payments', reports.cash.summary.receipts === 400 && reports.cash.summary.payments === 100],
    ['stock.movements', reports.stock.summary.totalMovements === 2 && reports.stock.summary.netMovement === 200],
    ['ar.net', reports.ar.summary.netARChange === 662],
    ['ap.net', reports.ap.summary.netAPChange === 250],
    ['journal.entries', reports.journal.summary.totalEntries === 1 && reports.journal.summary.totalDebits === 1180],
    ['tax.net vat/wht', reports.tax.summary.totalOutputVAT === 162 && reports.tax.summary.netWithholdingTax === -10]
  ];

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length > 0) {
    console.error(JSON.stringify(reports, null, 2));
    throw new Error(`Daily report checks failed: ${failed.map(([name]) => name).join(', ')}`);
  }

  const excelBuffer = await ExcelFormatter.createMultiSheet({
    Summary: {
      columns: [{ header: 'Metric', key: 'metric', width: 20 }, { header: 'Amount', key: 'amount', width: 15, type: 'currency' }],
      data: [{ metric: 'Net Output VAT', amount: reports.tax.summary.totalOutputVAT }]
    },
    Withholding: {
      columns: [{ header: 'Tax Type', key: 'taxType', width: 25 }, { header: 'Amount', key: 'amount', width: 15, type: 'currency' }],
      data: reports.tax.withholdingBreakdown
    }
  });
  if (!Buffer.isBuffer(excelBuffer) || excelBuffer.length < 1000) throw new Error('Excel buffer not generated');

  const pdfChunks = [];
  const doc = new PDFDocument();
  doc.on('data', chunk => pdfChunks.push(chunk));
  const pdfDone = new Promise(resolve => doc.on('end', resolve));
  pdfRenderer.renderReportHeader(doc, { companyName: company.name, companyTin: company.tax_identification_number, reportTitle: 'Daily Tax Collected', period: date });
  pdfRenderer.renderSummarySection(doc, [{ label: 'Net Output VAT', value: reports.tax.summary.totalOutputVAT }]);
  pdfRenderer.renderDataTable(doc, { headers: ['Tax Type', 'Amount'], columnWidths: [300, 100], data: reports.tax.withholdingBreakdown, dataMapper: item => [item.taxType, item.amount] });
  doc.end();
  await pdfDone;
  const pdfBuffer = Buffer.concat(pdfChunks);
  if (pdfBuffer.length < 1000) throw new Error('PDF buffer not generated');

  console.log('daily-report-service-ok');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(reports).map(([key, value]) => [key, value.summary])), null, 2));
  console.log(`excel-bytes=${excelBuffer.length}`);
  console.log(`pdf-bytes=${pdfBuffer.length}`);

  await mongoose.disconnect();
  await mongod.stop();
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
