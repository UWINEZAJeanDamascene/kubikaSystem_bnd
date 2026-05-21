const mongoose = require('mongoose');

const ebmImportedItemSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  branchId: { type: String, required: true, trim: true, minlength: 2, maxlength: 2, default: '00' },

  importTaskCode: { type: String, required: true, trim: true },
  importDeclarationNo: { type: String, default: null, trim: true },
  importDate: { type: Date, default: null },

  itemCode: { type: String, default: null, trim: true },
  itemName: { type: String, required: true, trim: true },
  itemClassCode: { type: String, default: null, trim: true },
  quantity: { type: Number, required: true, min: 0 },
  unitCode: { type: String, default: null, trim: true },
  originCountryCode: { type: String, default: null, trim: true },
  supplierTin: { type: String, default: null, trim: true },
  supplierName: { type: String, default: null, trim: true },
  unitCost: { type: Number, default: 0, min: 0 },
  taxTypeCode: { type: String, default: null, trim: true },
  taxRate: { type: Number, default: 0, min: 0 },

  raw: { type: mongoose.Schema.Types.Mixed, default: {} },

  confirmationStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected'],
    default: 'pending',
    index: true,
  },
  pulledAt: { type: Date, default: Date.now },
  confirmedAt: { type: Date, default: null },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedAt: { type: Date, default: null },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectionReason: { type: String, default: null, trim: true },

  stockUpdated: { type: Boolean, default: false },
  stockUpdateError: { type: String, default: null, trim: true },
  confirmationError: { type: String, default: null, trim: true },

  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
  purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
  grn: { type: mongoose.Schema.Types.ObjectId, ref: 'GoodsReceivedNote', default: null },

  rraConfirmedAt: { type: Date, default: null },
  rraResult: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

ebmImportedItemSchema.index({ company: 1, branchId: 1, importTaskCode: 1 }, { unique: true });
ebmImportedItemSchema.index({ company: 1, confirmationStatus: 1, importDate: -1 });
ebmImportedItemSchema.index({ company: 1, itemCode: 1 });

module.exports = mongoose.model('EBMImportedItem', ebmImportedItemSchema);
