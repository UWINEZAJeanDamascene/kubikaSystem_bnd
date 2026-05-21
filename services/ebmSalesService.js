const Invoice = require('../models/Invoice');
const Company = require('../models/Company');
const Warehouse = require('../models/Warehouse');
const EBMCode = require('../models/EBMCode');
require('../models/Client');
require('../models/Product');
const ebmService = require('./ebmService');
const { formatVsdcDateTime } = require('./ebmService');

const SUCCESS_RESULT = '000';

function toNumber(value, fallback = 0) {
  if (value == null) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (value && typeof value.toString === 'function') {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundRwf(value) {
  return Math.round(toNumber(value));
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[_-]/g, ' ').trim();
}

function getTin(company) {
  return company?.tax_identification_number || company?.registration_number || company?.tin;
}

function getInvoiceNumber(invoice) {
  return invoice.referenceNo || invoice.invoiceNumber || invoice._id;
}

function getInvoiceLines(invoice) {
  return invoice.lines && invoice.lines.length ? invoice.lines : (invoice.items || []);
}

function getProduct(line) {
  return line.product && typeof line.product === 'object' ? line.product : null;
}

function getProductEbm(line) {
  const product = getProduct(line);
  return product?.ebm || {};
}

function getLineName(line) {
  const product = getProduct(line);
  return line.productName || line.description || product?.name || 'Item';
}

function getProductCode(line) {
  const product = getProduct(line);
  const ebm = product?.ebm || {};
  return ebm.ebmItemCode || line.productCode || line.itemCode || product?.sku;
}

function getCustomerTin(invoice) {
  return invoice.customerTin || invoice.client?.taxId || invoice.client?.tin || invoice.client?.tax_identification_number || '';
}

function getCustomerName(invoice) {
  return invoice.customerName || invoice.client?.name || 'Walk-in Customer';
}

function buildQrString(data) {
  return [data.rcptSign, data.intrlData, data.rcptNo, data.rcptDt]
    .filter(Boolean)
    .join('|');
}

async function findCode(companyId, { className, namePatterns = [], requiredFor }) {
  const query = {
    company: companyId,
    active: true,
    codeClassName: { $regex: className, $options: 'i' },
  };
  const codes = await EBMCode.find(query).sort({ sortOrder: 1, code: 1 }).lean();

  for (const pattern of namePatterns) {
    const regex = new RegExp(escapeRegex(pattern), 'i');
    const found = codes.find((code) => regex.test(code.name || '') || regex.test(code.description || '') || regex.test(code.code || ''));
    if (found) return found.code;
  }

  if (codes.length === 1) return codes[0].code;

  const error = new Error(`EBM code data is missing or ambiguous for ${requiredFor}. Sync RRA code data first.`);
  error.code = 'EBM_CODE_NOT_SYNCED';
  error.retryable = false;
  throw error;
}

async function resolveHeaderCodes(invoice, companyId) {
  const paymentCode = await resolvePaymentCode(invoice, companyId);
  const receiptCode = invoice.ebm?.rcptTyCd || await findCode(companyId, {
    className: 'receipt',
    namePatterns: ['sale', 'normal sale'],
    requiredFor: 'receipt type',
  });
  const salesCode = invoice.ebm?.salesTyCd || await findCode(companyId, {
    className: 'transaction',
    namePatterns: ['normal', 'sale'],
    requiredFor: 'sales transaction type',
  });
  const currencyCode = await findCode(companyId, {
    className: 'currency',
    namePatterns: [invoice.currencyCode || invoice.currency || 'RWF', 'Rwandan franc'],
    requiredFor: 'currency',
  });
  const countryCode = await findCode(companyId, {
    className: 'country',
    namePatterns: ['Rwanda', 'RW'],
    requiredFor: 'sale country',
  });

  return {
    pmtTyCd: paymentCode,
    rcptTyCd: receiptCode,
    salesTyCd: salesCode,
    currencyTyCd: currencyCode,
    saleCtyCd: countryCode,
  };
}

async function resolvePaymentCode(invoice, companyId, paymentMethod = null) {
  if (!paymentMethod && invoice.ebm?.pmtTyCd) return invoice.ebm.pmtTyCd;

  const payments = invoice.payments || [];
  const method = normalizeText(paymentMethod || payments[0]?.paymentMethod || (payments.length ? 'cash' : 'credit'));
  const namePatterns = method.includes('mobile')
    ? ['mobile money', 'momo']
    : method.includes('bank')
      ? ['bank', 'transfer']
      : method.includes('card')
        ? ['card']
        : method.includes('cheque') || method.includes('check')
          ? ['cheque', 'check']
          : method.includes('credit')
            ? ['credit']
            : ['cash'];

  return findCode(companyId, {
    className: 'payment',
    namePatterns,
    requiredFor: `payment method ${paymentMethod || method}`,
  });
}

async function resolveBranch(invoice, companyId, requestedBranchId = null) {
  if (requestedBranchId) {
    const branch = await Warehouse.findOne({ company: companyId, rraBranchId: requestedBranchId }).lean();
    if (branch) return branch;
  }

  const lines = getInvoiceLines(invoice);
  for (const line of lines) {
    const warehouseId = line.warehouse || getProduct(line)?.defaultWarehouse;
    if (warehouseId) {
      const branch = await Warehouse.findOne({ _id: warehouseId, company: companyId }).lean();
      if (branch?.rraBranchId) return branch;
    }
  }

  const branch = await Warehouse.findOne({ company: companyId, isDefault: true }).lean()
    || await Warehouse.findOne({ company: companyId }).sort({ createdAt: 1 }).lean();

  if (!branch?.rraBranchId) {
    const error = new Error('No EBM branch ID is available for this invoice. Register a branch before submitting to RRA.');
    error.code = 'EBM_BRANCH_MISSING';
    error.retryable = false;
    throw error;
  }

  return branch;
}

function buildLinePayload(line, itemSeq) {
  const ebm = getProductEbm(line);
  const product = getProduct(line);
  const qty = toNumber(line.qty || line.quantity, 0);
  const unitPrice = toNumber(line.unitPrice || line.price, 0);
  const grossBeforeDiscount = qty * unitPrice;
  const discountPct = toNumber(line.discountPct, 0);
  const rawDiscount = toNumber(line.discount, 0);
  const discountAmount = discountPct > 0 ? grossBeforeDiscount * (discountPct / 100) : rawDiscount;
  const storedLineTotal = line.lineTotal != null ? line.lineTotal : line.totalWithTax;
  const lineGross = roundRwf(Math.max(0, storedLineTotal != null
    ? toNumber(storedLineTotal)
    : grossBeforeDiscount - discountAmount));
  const taxTyCd = ebm.taxTyCd || ebm.taxTypeCode || line.taxCode || product?.taxCode;

  if (!taxTyCd || !['A', 'B', 'C', 'D'].includes(taxTyCd)) {
    const error = new Error(`Product ${getLineName(line)} has no valid RRA tax type code.`);
    error.code = 'EBM_PRODUCT_TAX_CODE_MISSING';
    error.retryable = false;
    throw error;
  }

  const itemCd = getProductCode(line);
  const itemClsCd = ebm.itemClassCd || ebm.itemClassCode;
  const pkgUnitCd = ebm.pkgUnitCd || ebm.packagingUnitCode;
  const qtyUnitCd = ebm.qtyUnitCd || ebm.quantityUnitCode;

  if (!itemCd || !itemClsCd || !pkgUnitCd || !qtyUnitCd) {
    const error = new Error(`Product ${getLineName(line)} is missing EBM registration/classification fields.`);
    error.code = 'EBM_PRODUCT_CODES_MISSING';
    error.retryable = false;
    throw error;
  }

  let taxblAmt = lineGross;
  let taxAmt = 0;
  if (taxTyCd === 'B') {
    taxblAmt = roundRwf(lineGross / 1.18);
    taxAmt = lineGross - taxblAmt;
  }

  return {
    itemSeq,
    itemCd,
    itemClsCd,
    itemNm: getLineName(line),
    bcd: product?.barcode || '',
    pkgUnitCd,
    pkg: 1,
    qtyUnitCd,
    qty,
    prc: roundRwf(unitPrice),
    splyAmt: taxTyCd === 'B' ? roundRwf((lineGross + discountAmount) / 1.18) : roundRwf(grossBeforeDiscount),
    dcRt: discountPct,
    dcAmt: roundRwf(discountAmount),
    isrccCd: '',
    isrccNm: '',
    isrcRt: 0,
    isrcAmt: 0,
    taxTyCd,
    taxblAmt,
    taxAmt,
    totAmt: lineGross,
  };
}

async function buildPaymentList(invoice, companyId, totalAmount) {
  const payments = invoice.payments || [];
  if (!payments.length) {
    return [{
      payTyCd: await resolvePaymentCode(invoice, companyId, 'credit'),
      payAmt: totalAmount,
    }];
  }

  const payList = [];
  for (const payment of payments) {
    payList.push({
      payTyCd: await resolvePaymentCode(invoice, companyId, payment.paymentMethod),
      payAmt: roundRwf(payment.amount),
    });
  }
  return payList;
}

async function buildSalesTrnPayload(invoice, company, branch) {
  if (!invoice) throw new Error('Invoice is required to build EBM sales payload.');
  if (!company) throw new Error('Company is required to build EBM sales payload.');
  if (!branch?.rraBranchId) throw new Error('Branch with RRA branch ID is required to build EBM sales payload.');

  const companyId = invoice.company || company._id;
  const tin = getTin(company);
  if (!tin) {
    const error = new Error('Company TIN is required for EBM sales submission.');
    error.code = 'EBM_TIN_MISSING';
    error.retryable = false;
    throw error;
  }

  const headerCodes = await resolveHeaderCodes(invoice, companyId);
  const cfmDt = formatVsdcDateTime(invoice.confirmedDate || invoice.invoiceDate || invoice.createdAt || new Date());
  const lines = getInvoiceLines(invoice).map((line, index) => buildLinePayload(line, index + 1));

  const buckets = {
    A: { taxbl: 0, tax: 0 },
    B: { taxbl: 0, tax: 0 },
    C: { taxbl: 0, tax: 0 },
    D: { taxbl: 0, tax: 0 },
  };
  lines.forEach((line) => {
    buckets[line.taxTyCd].taxbl += line.taxblAmt;
    buckets[line.taxTyCd].tax += line.taxAmt;
  });

  const totTaxblAmt = roundRwf(lines.reduce((sum, line) => sum + line.taxblAmt, 0));
  const totTaxAmt = roundRwf(lines.reduce((sum, line) => sum + line.taxAmt, 0));
  const totAmt = roundRwf(lines.reduce((sum, line) => sum + line.totAmt, 0));
  const payList = await buildPaymentList(invoice, companyId, totAmt);

  return {
    companyId,
    tin,
    bhfId: branch.rraBranchId,
    invcNo: String(getInvoiceNumber(invoice)),
    orgInvcNo: invoice.originalInvoiceNo || invoice.orgInvcNo || 0,
    custTin: getCustomerTin(invoice),
    custNm: getCustomerName(invoice),
    rcptTyCd: headerCodes.rcptTyCd,
    pmtTyCd: headerCodes.pmtTyCd,
    salesTyCd: headerCodes.salesTyCd,
    invcSttsCd: invoice.status || 'confirmed',
    cfmDt,
    salesDt: formatVsdcDateTime(invoice.invoiceDate || invoice.createdAt || new Date()),
    stockRlsDt: formatVsdcDateTime(invoice.confirmedDate || new Date()),
    prchrAcptcYn: getCustomerTin(invoice) ? 'Y' : 'N',
    remark: invoice.notes || '',
    saleCtyCd: headerCodes.saleCtyCd,
    lpoNumber: invoice.lpoNumber || invoice.lpoNo || '',
    currencyTyCd: headerCodes.currencyTyCd,
    exchangeRt: toNumber(invoice.exchangeRate, 1) || 1,
    taxblAmtA: roundRwf(buckets.A.taxbl),
    taxblAmtB: roundRwf(buckets.B.taxbl),
    taxblAmtC: roundRwf(buckets.C.taxbl),
    taxblAmtD: roundRwf(buckets.D.taxbl),
    taxAmtA: roundRwf(buckets.A.tax),
    taxAmtB: roundRwf(buckets.B.tax),
    taxAmtC: roundRwf(buckets.C.tax),
    taxAmtD: roundRwf(buckets.D.tax),
    totTaxblAmt,
    totTaxAmt,
    totAmt,
    itemList: lines,
    payList,
  };
}

async function markPending(invoiceId, companyId) {
  return Invoice.findOneAndUpdate(
    {
      _id: invoiceId,
      company: companyId,
      'ebm.ebmStatus': { $ne: 'submitted' },
    },
    {
      $set: {
        'ebm.ebmStatus': 'pending',
        'ebm.lastError': null,
      },
    },
    { new: true },
  ).populate('client lines.product createdBy');
}

async function applySuccess(invoiceId, companyId, response, payload) {
  const data = response?.data || {};
  const rcptDt = data.rcptDt || data.vsdcRcptPbctDate || response?.resultDt || formatVsdcDateTime();
  const qrCode = buildQrString({
    rcptSign: data.rcptSign,
    intrlData: data.intrlData,
    rcptNo: data.rcptNo,
    rcptDt,
  });

  return Invoice.findOneAndUpdate(
    { _id: invoiceId, company: companyId, 'ebm.ebmStatus': { $ne: 'submitted' } },
    {
      $set: {
        'ebm.rcptSign': data.rcptSign || null,
        'ebm.intrlData': data.intrlData || null,
        'ebm.rcptNo': data.rcptNo != null ? String(data.rcptNo) : null,
        'ebm.rcptDt': rcptDt,
        'ebm.qrCode': qrCode,
        'ebm.submittedAt': new Date(),
        'ebm.ebmStatus': 'submitted',
        'ebm.lastError': null,
        'ebm.rcptTyCd': payload.rcptTyCd,
        'ebm.pmtTyCd': payload.pmtTyCd,
        'ebm.salesTyCd': payload.salesTyCd,
        'ebm.cfmDt': payload.cfmDt,
      },
    },
    { new: true },
  ).populate('client lines.product createdBy');
}

async function applyFailure(invoiceId, companyId, error, payload = null) {
  const status = error?.retryable === false ? 'failed' : 'pending';
  return Invoice.findOneAndUpdate(
    { _id: invoiceId, company: companyId, 'ebm.ebmStatus': { $ne: 'submitted' } },
    {
      $set: {
        'ebm.ebmStatus': status,
        'ebm.lastError': error?.message || 'EBM sales submission failed',
        ...(payload ? {
          'ebm.rcptTyCd': payload.rcptTyCd,
          'ebm.pmtTyCd': payload.pmtTyCd,
          'ebm.salesTyCd': payload.salesTyCd,
          'ebm.cfmDt': payload.cfmDt,
        } : {}),
      },
      $inc: { 'ebm.retryCount': 1 },
    },
    { new: true },
  ).populate('client lines.product createdBy');
}

async function submitInvoice(invoiceId, { companyId, branchId = null } = {}) {
  const invoice = await Invoice.findOne({ _id: invoiceId, company: companyId })
    .populate('client')
    .populate('lines.product')
    .populate('createdBy');
  if (!invoice) {
    const error = new Error('Invoice not found for EBM sales submission.');
    error.code = 'EBM_INVOICE_NOT_FOUND';
    error.retryable = false;
    throw error;
  }

  if (invoice.ebm?.ebmStatus === 'submitted') return invoice;

  await markPending(invoice._id, companyId);
  const company = await Company.findById(companyId).lean();
  const branch = await resolveBranch(invoice, companyId, branchId);
  let payload = null;

  try {
    payload = await buildSalesTrnPayload(invoice, company, branch);
    const response = await ebmService.saveSales(payload);
    if (response.resultCd !== SUCCESS_RESULT) {
      const error = new Error(response.resultMsg || 'RRA rejected sales submission.');
      error.response = response;
      throw error;
    }
    return applySuccess(invoice._id, companyId, response, payload);
  } catch (error) {
    const failedInvoice = await applyFailure(invoice._id, companyId, error, payload);
    error.invoice = failedInvoice;
    throw error;
  }
}

function submitInvoiceAsync(invoiceId, options = {}) {
  setImmediate(() => {
    submitInvoice(invoiceId, options).catch((error) => {
      console.error('[EBMSales] Async sales submission failed:', error.message);
    });
  });
}

module.exports = {
  buildSalesTrnPayload,
  markPending,
  submitInvoice,
  submitInvoiceAsync,
  resolveBranch,
};
