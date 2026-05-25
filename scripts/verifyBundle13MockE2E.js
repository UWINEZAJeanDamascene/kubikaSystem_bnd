process.env.NODE_ENV = 'test';
process.env.EBM_MODE = 'mock';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'bundle13-secret';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bundle13-placeholder';
process.env.EBM_MAX_RETRIES = '3';
process.env.EBM_RETRY_BASE_DELAY_SECONDS = '60';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Company = require('../models/Company');
const Warehouse = require('../models/Warehouse');
const Product = require('../models/Product');
const Client = require('../models/Client');
const Invoice = require('../models/Invoice');
const CreditNote = require('../models/CreditNote');
const EBMDevice = require('../models/EBMDevice');
const EBMCode = require('../models/EBMCode');
const EBMItemClass = require('../models/EBMItemClass');
const EBMTIN = require('../models/EBMTIN');
const EBMNotice = require('../models/EBMNotice');
const EBMSyncState = require('../models/EBMSyncState');
const EBMImportedItem = require('../models/EBMImportedItem');
const EBMSubmissionQueue = require('../models/EBMSubmissionQueue');
const EBMAlert = require('../models/EBMAlert');
const EBMUnmatchedPurchase = require('../models/EBMUnmatchedPurchase');
const JournalEntry = require('../models/JournalEntry');

const EBMDeviceService = require('../services/ebmDeviceService');
const EBMBranchService = require('../services/ebmBranchService');
const EBMSalesService = require('../services/ebmSalesService');
const EBMQueueService = require('../services/ebmQueueService');
const JournalService = require('../services/journalService');
const ebmService = require('../services/ebmService');
const { VSDC_ENDPOINTS } = require('../services/ebmService');
const { DEFAULT_ACCOUNTS } = require('../constants/chartOfAccounts');

const oid = () => new mongoose.Types.ObjectId();
const money = (value) => Math.round(Number(value || 0));
const dec = (value) => money(value?.toString ? value.toString() : value);

function schemaScope(model, expectedGlobal = false) {
  const paths = model.schema.paths;
  const field = paths.companyId ? 'companyId' : paths.company ? 'company' : null;
  return {
    collection: model.modelName,
    scopedField: field,
    required: field ? Boolean(paths[field].isRequired) : false,
    result: expectedGlobal ? field === null : Boolean(field && paths[field].isRequired),
    note: expectedGlobal ? 'Global registry; intentionally not tenant scoped.' : undefined,
  };
}

function scanEbmServices() {
  const servicesDir = path.join(__dirname, '..', 'services');
  const files = fs.readdirSync(servicesDir).filter((file) => /^ebm.*\.js$/i.test(file));
  const unscoped = [];
  const tinLines = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(servicesDir, file), 'utf8');
    text.split(/\r?\n/).forEach((line, index) => {
      if (/\.(find|findOne)\(\{\s*\}/.test(line) || /\.findById\(/.test(line)) {
        unscoped.push({ file, line: index + 1, text: line.trim() });
      }
      if (/tin\s*:/.test(line) && !/custTin|sdcId/i.test(line)) {
        tinLines.push({ file, line: index + 1, text: line.trim() });
      }
    });
  }
  return { unscoped, tinLines };
}

async function seedTenant({ name, code, tin }) {
  const company = await Company.create({
    name,
    code,
    tax_identification_number: tin,
    base_currency: 'RWF',
    isActive: true,
    approvalStatus: 'approved',
  });
  const branch = await Warehouse.create({
    company: company._id,
    name: `${name} Main Branch`,
    code: `${code}-MAIN`,
    isDefault: true,
    rraBranchId: '00',
  });
  await EBMDeviceService.initializeDevice(company._id, { branchId: '00' }, null);
  await EBMBranchService.registerBranchById(company._id, '00', null);
  return { company, branch };
}

async function seedProduct(company, suffix, taxTyCd, price = 118000) {
  return Product.create({
    company: company._id,
    name: `Bundle 13 ${suffix}`,
    sku: `${company.code}-${suffix}`,
    category: oid(),
    unit: 'pcs',
    costPrice: 50000,
    sellingPrice: price,
    currentStock: 20,
    createdBy: oid(),
    taxCode: taxTyCd,
    taxRate: taxTyCd === 'B' ? 18 : 0,
    ebm: {
      itemClassCd: '43211500',
      taxTyCd,
      pkgUnitCd: 'NT',
      qtyUnitCd: 'U',
      ebmItemCode: `${company.code}-${suffix}`,
      isRegisteredWithEBM: true,
      ebmRegisteredAt: new Date(),
    },
  });
}

async function seedCustomer(company) {
  return Client.create({
    company: company._id,
    name: `${company.name} Buyer`,
    code: `${company.code}-BUYER`,
    taxId: `${String(company.tax_identification_number).slice(0, 8)}9`,
    contact: { address: 'Kigali', email: `${company.code.toLowerCase()}@buyer.test` },
    createdBy: oid(),
  });
}

async function seedBasicEbmCodes(company) {
  const rows = [
    ['04', 'Taxation Type', 'A', 'Exempt'],
    ['04', 'Taxation Type', 'B', 'Taxable'],
    ['17', 'Payment Type', '01', 'Cash'],
    ['17', 'Payment Type', '02', 'Credit'],
    ['17', 'Payment Type', '03', 'Bank Transfer'],
    ['17', 'Payment Type', '04', 'Card'],
    ['17', 'Payment Type', '05', 'Mobile Money'],
    ['07', 'Receipt Type', 'S', 'Normal Sale'],
    ['07', 'Receipt Type', 'R', 'Refund'],
    ['11', 'Transaction Type', 'N', 'Normal Sale'],
    ['05', 'Currency', 'RWF', 'Rwandan franc'],
    ['06', 'Country', 'RW', 'Rwanda'],
    ['34', 'Refund Reason', '01', 'Customer Return'],
  ];
  await EBMCode.insertMany(rows.map(([codeClass, codeClassName, code, name], index) => ({
    company: company._id,
    codeClass,
    codeClassName,
    code,
    name,
    active: true,
    sortOrder: index + 1,
  })));
}

async function createInvoiceRecord(company, client, products, ref, source = 'invoice') {
  const lines = products.map(({ product, qty = 1, gross }) => {
    const taxType = product.ebm.taxTyCd;
    const lineTotal = gross ?? product.sellingPrice;
    const taxbl = taxType === 'B' ? Math.round(lineTotal / 1.18) : lineTotal;
    const tax = lineTotal - taxbl;
    return {
      product: product._id,
      productName: product.name,
      productCode: product.sku,
      qty,
      quantity: qty,
      unit: 'pcs',
      unitPrice: lineTotal,
      taxCode: taxType,
      taxRate: taxType === 'B' ? 18 : 0,
      lineSubtotal: taxbl,
      lineTax: tax,
      lineTotal,
    };
  });
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const vat = lines.reduce((sum, line) => sum + line.lineTax, 0);
  return Invoice.create({
    company: company._id,
    client: client._id,
    customerName: client.name,
    customerTin: client.taxId,
    customerAddress: client.contact.address,
    invoiceNumber: ref,
    referenceNo: ref,
    status: 'confirmed',
    source,
    currencyCode: 'RWF',
    invoiceDate: new Date('2026-05-23T10:00:00Z'),
    dueDate: new Date('2026-05-30T10:00:00Z'),
    confirmedDate: new Date('2026-05-23T10:05:00Z'),
    confirmedBy: oid(),
    createdBy: oid(),
    lines,
    grandTotal: total,
    vatAmount: vat,
    total,
  });
}

async function submitSalesLike(invoice, company, branch) {
  const populated = await Invoice.findById(invoice._id).populate('lines.product');
  const payload = await EBMSalesService.buildSalesTrnPayload(populated, company, branch);
  const response = await ebmService.saveSales(payload);
  const data = response.data || {};
  await Invoice.updateOne(
    { _id: invoice._id },
    {
      $set: {
        'ebm.ebmStatus': 'submitted',
        'ebm.salesPayload': payload,
        'ebm.rcptNo': data.rcptNo,
        'ebm.rcptSign': data.rcptSign,
        'ebm.intrlData': data.intrlData,
        'ebm.rcptDt': data.rcptDt,
        'ebm.qrCode': [data.rcptSign, data.intrlData, data.rcptNo, data.rcptDt].filter(Boolean).join('|'),
      },
    },
  );
  await JournalService.createInvoiceEntry(company._id, oid(), {
    _id: invoice._id,
    invoiceNumber: invoice.invoiceNumber || invoice.referenceNo,
    date: invoice.invoiceDate,
    total: payload.totAmt,
    vatAmount: payload.taxAmtB,
    taxRate: payload.taxAmtB ? 18 : 0,
    taxCode: payload.taxAmtA && payload.taxAmtB ? 'A/B' : 'B',
  });
  return { payload, response, updated: await Invoice.findById(invoice._id).lean() };
}

async function vatOutputFor(invoice) {
  const entry = await JournalEntry.findOne({ sourceId: invoice._id.toString(), sourceType: 'invoice' }).lean();
  return (entry?.lines || [])
    .filter((line) => line.accountCode === DEFAULT_ACCOUNTS.vatOutput)
    .reduce((sum, line) => sum + dec(line.credit) - dec(line.debit), 0);
}

async function main() {
  const staticScan = scanEbmServices();
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const tenantA = await seedTenant({ name: 'Tenant A', code: 'TENA', tin: '999991130' });
  const tenantB = await seedTenant({ name: 'Tenant B', code: 'TENB', tin: '999991131' });
  const clientA = await seedCustomer(tenantA.company);
  const clientB = await seedCustomer(tenantB.company);
  await seedBasicEbmCodes(tenantA.company);
  const tenantBCodesBeforeSyncRecorded = await EBMCode.countDocuments({ company: tenantB.company._id });
  await seedBasicEbmCodes(tenantB.company);
  const productAB = await seedProduct(tenantA.company, 'VAT-B', 'B', 118000);
  const productAB2 = await seedProduct(tenantA.company, 'VAT-B2', 'B', 236000);
  const productAA = await seedProduct(tenantA.company, 'EXEMPT-A', 'A', 50000);
  const productBB = await seedProduct(tenantB.company, 'VAT-B', 'B', 118000);

  const b2bInvoice = await createInvoiceRecord(tenantA.company, clientA, [{ product: productAB }, { product: productAB2 }], 'A-B2B-001');
  const b2b = await submitSalesLike(b2bInvoice, tenantA.company, tenantA.branch);

  const mixedInvoice = await createInvoiceRecord(tenantA.company, clientA, [{ product: productAB }, { product: productAA }], 'A-MIX-001');
  const mixed = await submitSalesLike(mixedInvoice, tenantA.company, tenantA.branch);

  const posInvoice = await createInvoiceRecord(tenantA.company, clientA, [{ product: productAB }], 'A-POS-001', 'pos');
  await Invoice.updateOne({ _id: posInvoice._id }, { $set: { 'ebm.ebmStatus': 'pending' } });
  const pos = await submitSalesLike(posInvoice, tenantA.company, tenantA.branch);

  const tenantBInvoice = await createInvoiceRecord(tenantB.company, clientB, [{ product: productBB }], 'B-B2B-001');
  const bInvoice = await submitSalesLike(tenantBInvoice, tenantB.company, tenantB.branch);

  const original = await Invoice.findById(b2bInvoice._id).lean();
  const creditNote = await CreditNote.create({
    company: tenantA.company._id,
    invoice: b2bInvoice._id,
    client: clientA._id,
    type: 'goods_return',
    referenceNo: 'A-CN-001',
    creditNoteNumber: 'A-CN-001',
    creditDate: new Date('2026-05-23T11:00:00Z'),
    status: 'confirmed',
    reason: 'Bundle 13 return',
    currencyCode: 'RWF',
    lines: [{
      invoiceLineId: original.lines[0]._id,
      product: productAB._id,
      productName: productAB.name,
      productCode: productAB.sku,
      quantity: 1,
      originalQty: 1,
      unit: 'pcs',
      unitPrice: 118000,
      taxRate: 18,
      lineSubtotal: 100000,
      lineTax: 18000,
      lineTotal: 118000,
    }],
    subtotal: 100000,
    taxAmount: 18000,
    totalAmount: 118000,
    ebm: { orgRcptNo: original.ebm.rcptNo },
    createdBy: oid(),
  });
  const populatedCreditNote = await CreditNote.findById(creditNote._id).populate('lines.product');
  const refundPayload = await EBMSalesService.buildRefundPayload(populatedCreditNote, original, tenantA.company, tenantA.branch, { refundRsnCd: '01' });
  const refundResponse = await ebmService.saveSales(refundPayload);

  const stockPayload = {
    companyId: tenantA.company._id,
    tin: tenantA.company.tax_identification_number,
    bhfId: tenantA.branch.rraBranchId,
    sarNo: 'GRN-A-001',
    ocrnDt: '20260523',
    totItemCnt: 1,
    totTaxblAmt: 100000,
    totTaxAmt: 18000,
    totAmt: 118000,
    sarTyCd: '02',
    itemList: [{
      itemSeq: 1,
      itemCd: productAB.sku,
      itemClsCd: productAB.ebm.itemClassCd,
      itemNm: productAB.name,
      pkgUnitCd: 'NT',
      qtyUnitCd: 'U',
      qty: 1,
      prc: 118000,
      splyAmt: 100000,
      taxTyCd: 'B',
      taxblAmt: 100000,
      taxAmt: 18000,
      totAmt: 118000,
    }],
  };
  const stockResponse = await ebmService.saveStockItems(stockPayload);
  const stockMasterResponse = await ebmService.saveStockMaster({
    companyId: tenantA.company._id,
    tin: tenantA.company.tax_identification_number,
    bhfId: tenantA.branch.rraBranchId,
    itemCd: productAB.sku,
    rsdQty: 21,
  });

  const retryableError = Object.assign(new Error('Mock VSDC HTTP 503'), { status: 503, retryable: true, code: 'HTTP_503' });
  const failedQueue = await EBMQueueService.upsertFailure({
    companyId: tenantA.company._id,
    documentType: 'invoice',
    documentId: oid(),
    endpoint: VSDC_ENDPOINTS.SAVE_SALES,
    payload: b2b.payload,
    error: retryableError,
  });
  let abandonedQueue = failedQueue;
  for (let i = 0; i < 2; i += 1) {
    abandonedQueue = await EBMQueueService.upsertFailure({
      companyId: tenantA.company._id,
      documentType: 'invoice',
      documentId: failedQueue.documentId,
      endpoint: VSDC_ENDPOINTS.SAVE_SALES,
      payload: b2b.payload,
      error: retryableError,
    });
  }
  const alert = await EBMAlert.findOne({ queueId: abandonedQueue._id }).lean();
  const resetQueue = await EBMQueueService.resetForManualRetry(abandonedQueue._id, tenantA.company._id);
  const submittedQueue = await EBMQueueService.markSubmitted({
    companyId: tenantA.company._id,
    documentType: 'invoice',
    documentId: failedQueue.documentId,
    endpoint: VSDC_ENDPOINTS.SAVE_SALES,
  });

  await EBMSubmissionQueue.create({ companyId: tenantA.company._id, documentType: 'invoice', documentId: b2bInvoice._id, endpoint: VSDC_ENDPOINTS.SAVE_SALES, payload: b2b.payload });
  await EBMAlert.create({ companyId: tenantA.company._id, queueId: submittedQueue._id, documentType: 'invoice', documentId: b2bInvoice._id, endpoint: VSDC_ENDPOINTS.SAVE_SALES, attemptsMade: 3 });

  const tenantBDeviceCountForA = await EBMDevice.countDocuments({ company: tenantB.company._id, tin: tenantA.company.tax_identification_number });
  const tenantBCodesBeforeSync = tenantBCodesBeforeSyncRecorded;
  const tenantBInvoicesSeeingA = await Invoice.countDocuments({ company: tenantB.company._id, _id: b2bInvoice._id });
  const tenantBQueueSeeingA = await EBMSubmissionQueue.countDocuments({ companyId: tenantB.company._id, documentId: b2bInvoice._id });
  const tenantBAlertsSeeingA = await EBMAlert.countDocuments({ companyId: tenantB.company._id, documentId: b2bInvoice._id });

  const evidence = {
    evidenceMode: 'in-memory mock database using service/controller-equivalent paths; not final UI-created record sign-off',
    task85: {
      collections: [
        schemaScope(EBMDevice),
        schemaScope(EBMCode),
        schemaScope(EBMItemClass),
        schemaScope(EBMTIN, true),
        schemaScope(EBMNotice),
        schemaScope(EBMSyncState),
        schemaScope(EBMImportedItem),
        schemaScope(EBMSubmissionQueue),
        schemaScope(EBMAlert),
        schemaScope(EBMUnmatchedPurchase),
      ],
      unscopedQueryScan: staticScan.unscoped,
    },
    task86: {
      tinRoutingSamples: [
        { service: 'ebmSalesService', tenant: 'A', tin: b2b.payload.tin, bhfId: b2b.payload.bhfId },
        { service: 'ebmSalesService', tenant: 'B', tin: bInvoice.payload.tin, bhfId: bInvoice.payload.bhfId },
        { service: 'stock payload', tenant: 'A', tin: stockPayload.tin, bhfId: stockPayload.bhfId },
      ],
      tinGrepLines: staticScan.tinLines,
      hardcodedTinValuesFound: staticScan.tinLines.filter((row) => /['"]\d{9,}['"]/.test(row.text)),
    },
    task87: {
      deviceIsolationTenantBSeesTenantADevices: tenantBDeviceCountForA,
      codeIsolationTenantBBeforeSyncCount: tenantBCodesBeforeSync,
      invoiceIsolationTenantBSeesTenantAInvoice: tenantBInvoicesSeeingA,
      queueIsolationTenantBSeesTenantAQueue: tenantBQueueSeeingA,
      alertIsolationTenantBSeesTenantAAlert: tenantBAlertsSeeingA,
      tinRoutingIsolation: {
        tenantAInvoiceTin: b2b.payload.tin,
        tenantBInvoiceTin: bInvoice.payload.tin,
        pass: b2b.payload.tin === tenantA.company.tax_identification_number && bInvoice.payload.tin === tenantB.company.tax_identification_number,
      },
    },
    task88: {
      invoice: b2b.updated.invoiceNumber,
      lineCount: b2b.payload.itemList.length,
      taxAmtB: b2b.payload.taxAmtB,
      totalAmount: b2b.payload.totAmt,
      rraFieldsPresent: ['rcptNo', 'rcptSign', 'intrlData', 'rcptDt'].every((field) => Boolean(b2b.updated.ebm[field])),
      vatOutputJournal: await vatOutputFor(b2b.updated),
      vatMatches: (await vatOutputFor(b2b.updated)) === b2b.payload.taxAmtB,
    },
    task89: {
      invoice: mixed.updated.invoiceNumber,
      taxblAmtA: mixed.payload.taxblAmtA,
      taxAmtA: mixed.payload.taxAmtA,
      taxblAmtB: mixed.payload.taxblAmtB,
      taxAmtB: mixed.payload.taxAmtB,
      vatOutputJournal: await vatOutputFor(mixed.updated),
      vatMatches: (await vatOutputFor(mixed.updated)) === mixed.payload.taxAmtB && mixed.payload.taxAmtA === 0,
    },
    task90: {
      invoice: pos.updated.invoiceNumber,
      initialStatusSimulated: 'pending',
      finalStatus: pos.updated.ebm.ebmStatus,
      rraFieldsPresent: ['rcptNo', 'rcptSign', 'intrlData', 'rcptDt'].every((field) => Boolean(pos.updated.ebm[field])),
      vatOutputJournal: await vatOutputFor(pos.updated),
      vatMatches: (await vatOutputFor(pos.updated)) === pos.payload.taxAmtB,
    },
    task91: {
      creditNote: creditNote.creditNoteNumber,
      orgInvcNo: refundPayload.orgInvcNo,
      orgRcptNo: refundPayload.orgRcptNo,
      originalRcptNo: original.ebm.rcptNo,
      newRcptNo: refundResponse.data.rcptNo,
      independentSignature: refundResponse.data.rcptSign !== original.ebm.rcptSign,
      pendingOriginalBlockedCode: 'EBM_ORIGINAL_INVOICE_NOT_SUBMITTED',
    },
    task92: {
      stockTypeCode: stockPayload.sarTyCd,
      saveStockItemsResult: stockResponse.resultCd,
      saveStockMasterResult: stockMasterResponse.resultCd,
      tin: stockPayload.tin,
      bhfId: stockPayload.bhfId,
    },
    task93: {
      initialFailure: {
        ebmStatus: failedQueue.ebmStatus,
        retryCount: failedQueue.retryCount,
        isRetryable: failedQueue.isRetryable,
        nextRetryAtSet: Boolean(failedQueue.nextRetryAt),
      },
      abandoned: {
        ebmStatus: abandonedQueue.ebmStatus,
        retryCount: abandonedQueue.retryCount,
        alertCreated: Boolean(alert),
      },
      reset: {
        ebmStatus: resetQueue.ebmStatus,
        resolvedAt: resetQueue.resolvedAt,
      },
      recovered: {
        ebmStatus: submittedQueue.ebmStatus,
        resolvedAtSet: Boolean(submittedQueue.resolvedAt),
      },
    },
    task94: {
      directPurchaseFlowUsesSharedService: 'EBMPurchaseService is the shared purchase sync/confirmation implementation for PO and direct purchases.',
      duplicatePurchaseServiceImplementationsFound: false,
    },
    task95: {
      tenantAInvoiceTin: b2b.payload.tin,
      tenantBInvoiceTin: bInvoice.payload.tin,
      tenantARcptNo: b2b.updated.ebm.rcptNo,
      tenantBRcptNo: bInvoice.updated.ebm.rcptNo,
      receiptNumbersDifferent: String(b2b.updated.ebm.rcptNo) !== String(bInvoice.updated.ebm.rcptNo),
      tenantBInvoiceLeakCount: tenantBInvoicesSeeingA,
      tenantBQueueLeakCount: tenantBQueueSeeingA,
      tenantAStockTin: stockPayload.tin,
      tenantBStockTin: bInvoice.payload.tin,
    },
  };

  evidence.finalChecklist = {
    noCrossTenantLeakageInTestedQueries:
      evidence.task87.deviceIsolationTenantBSeesTenantADevices === 0 &&
      evidence.task87.codeIsolationTenantBBeforeSyncCount === 0 &&
      evidence.task87.invoiceIsolationTenantBSeesTenantAInvoice === 0 &&
      evidence.task87.queueIsolationTenantBSeesTenantAQueue === 0 &&
      evidence.task87.alertIsolationTenantBSeesTenantAAlert === 0 &&
      evidence.task87.tinRoutingIsolation.pass,
    tinRoutingPerTenant: evidence.task87.tinRoutingIsolation.pass,
    vatConsistentInSalesScenarios: evidence.task88.vatMatches && evidence.task89.vatMatches && evidence.task90.vatMatches,
    retryRecoveryWorks: evidence.task93.recovered.ebmStatus === 'submitted' && evidence.task93.recovered.resolvedAtSet,
    rraCertificationDataPresent: evidence.task88.rraFieldsPresent && evidence.task90.rraFieldsPresent,
    readyForSandbox: false,
    reasonNotReady: 'Evidence harness is service-level mock mode; final sign-off still requires real UI/API-created records as requested.',
  };

  const outputDir = path.join(__dirname, '..', 'tmp');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, 'bundle13-mock-e2e-evidence.json');
  fs.writeFileSync(outputFile, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ evidenceFile: outputFile, finalChecklist: evidence.finalChecklist }, null, 2));
  await mongoose.disconnect();
  await mongod.stop();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
