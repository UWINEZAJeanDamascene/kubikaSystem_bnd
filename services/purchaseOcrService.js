const path = require('path');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const mongoose = require('mongoose');

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseJsonContent(content) {
  const raw = String(content || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const json = fenced ? fenced[1] : raw;
  return JSON.parse(json);
}

function assertSupportedFile(file) {
  if (!file) {
    const error = new Error('Upload a receipt or invoice image.');
    error.statusCode = 400;
    throw error;
  }
  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
  if (!allowed.includes(ext)) {
    const error = new Error('OCR upload supports PNG, JPG, JPEG, and WEBP images.');
    error.statusCode = 400;
    throw error;
  }
}

async function extractWithOpenAI(file) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('OCR provider is not configured. Set OPENAI_API_KEY to enable receipt and invoice scanning.');
    error.statusCode = 503;
    throw error;
  }

  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey });
  const model = process.env.OCR_MODEL || 'gpt-4o-mini';
  const mime = file.mimetype || 'image/jpeg';
  const imageUrl = `data:${mime};base64,${file.buffer.toString('base64')}`;

  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: 'Extract wholesale receipt or supplier invoice data. Return strict JSON only.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Return JSON with supplierName, supplierTin, invoiceNumber, invoiceDate, currency, and items array. Each item must include description, sku if visible, quantity, unitCost, and total if visible. Use null when unknown.'
          },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }
    ]
  });

  return parseJsonContent(response.choices?.[0]?.message?.content);
}

async function matchSupplier(companyId, extracted) {
  const tin = extracted.supplierTin || extracted.tin;
  if (tin) {
    const byTin = await Supplier.findOne({ company: companyId, taxId: String(tin).trim() }).lean();
    if (byTin) return { supplier: byTin, confidence: 1, matchedBy: 'tin' };
  }
  if (extracted.supplierName) {
    const suppliers = await Supplier.find({ company: companyId }).select('name taxId contact paymentTerms').lean();
    const target = normalizeText(extracted.supplierName);
    const supplier = suppliers.find((candidate) => normalizeText(candidate.name) === target)
      || suppliers.find((candidate) => normalizeText(candidate.name).includes(target) || target.includes(normalizeText(candidate.name)));
    if (supplier) return { supplier, confidence: 0.75, matchedBy: 'name' };
  }
  return { supplier: null, confidence: 0, matchedBy: null };
}

async function matchItems(companyId, extractedItems) {
  const products = await Product.find({ company: companyId, isArchived: { $ne: true }, isActive: { $ne: false } })
    .select('name sku unit taxCode taxRate costPrice averageCost defaultWarehouse preferredSupplier supplier')
    .lean();

  return (extractedItems || []).map((item) => {
    const sku = normalizeText(item.sku);
    const description = normalizeText(item.description || item.name);
    const product = sku
      ? products.find((candidate) => normalizeText(candidate.sku) === sku)
      : products.find((candidate) => normalizeText(candidate.name) === description)
        || products.find((candidate) => normalizeText(candidate.name).includes(description) || description.includes(normalizeText(candidate.name)));
    return {
      ...item,
      quantity: Number(item.quantity || 0),
      unitCost: Number(item.unitCost || item.price || 0),
      matchedProduct: product || null,
      matchConfidence: product ? (sku ? 1 : 0.72) : 0
    };
  });
}

async function scanInvoice({ companyId, file }) {
  assertSupportedFile(file);
  const extracted = await extractWithOpenAI(file);
  const supplierMatch = await matchSupplier(companyId, extracted);
  const items = await matchItems(companyId, extracted.items || []);

  return {
    extracted,
    supplierMatch,
    items,
    readyForDirectPurchase: Boolean(supplierMatch.supplier && items.length && items.every((item) => item.matchedProduct && item.quantity > 0 && item.unitCost >= 0))
  };
}

function decimal(value, fallback = '0') {
  const number = Number(value);
  return mongoose.Types.Decimal128.fromString(String(Number.isFinite(number) ? number : fallback));
}

async function createDraftPurchaseFromScan({ companyId, userId, file }) {
  const scan = await scanInvoice({ companyId, file });
  if (!scan.readyForDirectPurchase) {
    const error = new Error('OCR result is not ready for direct purchase. Review unmatched supplier or product lines first.');
    error.statusCode = 422;
    error.details = scan;
    throw error;
  }

  const supplier = scan.supplierMatch.supplier;
  const items = scan.items.map((item) => {
    const product = item.matchedProduct;
    const quantity = Number(item.quantity || 0);
    const unitCost = Number(item.unitCost || 0);
    const subtotal = quantity * unitCost;
    return {
      product: product._id,
      itemCode: product.sku,
      description: item.description || product.name,
      quantity: decimal(quantity),
      unit: product.unit,
      unitCost: decimal(unitCost),
      taxCode: product.taxCode || 'A',
      taxRate: product.taxRate || 0,
      subtotal: decimal(subtotal),
      totalWithTax: decimal(subtotal),
      warehouse: product.defaultWarehouse || null
    };
  });

  const purchase = await Purchase.create({
    company: companyId,
    supplier: supplier._id,
    supplierTin: supplier.taxId,
    supplierName: supplier.name,
    supplierAddress: supplier.contact?.address,
    supplierInvoiceNumber: scan.extracted.invoiceNumber || null,
    supplierInvoiceDate: scan.extracted.invoiceDate ? new Date(scan.extracted.invoiceDate) : null,
    status: 'draft',
    paymentTerms: supplier.paymentTerms || 'cash',
    currency: scan.extracted.currency || 'FRW',
    items,
    createdBy: userId,
    notes: 'Draft direct purchase created from receipt/invoice OCR scan. Review before receiving stock.'
  });

  return { scan, purchase };
}

module.exports = {
  scanInvoice,
  createDraftPurchaseFromScan
};
