const mongoose = require('mongoose');

const ebmUnmatchedPurchaseSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  branchId: { type: String, required: true, trim: true, minlength: 2, maxlength: 2, index: true },
  supplierTin: { type: String, default: null, trim: true, index: true },
  supplierName: { type: String, default: null, trim: true },
  sellerInvoiceNo: { type: String, required: true, trim: true },
  invoiceDate: { type: Date, default: null },
  totalAmount: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: {
    type: String,
    enum: ['unmatched', 'linked', 'reviewed'],
    default: 'unmatched',
    index: true,
  },
  linkedDocumentType: {
    type: String,
    enum: ['PurchaseOrder', 'Purchase', null],
    default: null,
  },
  linkedDocument: { type: mongoose.Schema.Types.ObjectId, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  pulledAt: { type: Date, default: Date.now },
}, { timestamps: true });

ebmUnmatchedPurchaseSchema.index(
  { company: 1, branchId: 1, supplierTin: 1, sellerInvoiceNo: 1 },
  { unique: true },
);
ebmUnmatchedPurchaseSchema.index({ company: 1, status: 1, pulledAt: -1 });

module.exports = mongoose.model('EBMUnmatchedPurchase', ebmUnmatchedPurchaseSchema);
