const mongoose = require('mongoose');

const grnMatchSchema = new mongoose.Schema({
  grn: { type: mongoose.Schema.Types.ObjectId, ref: 'GoodsReceivedNote', required: true },
  amountAllocated: { type: Number, required: true, min: 0 },
}, { _id: true });

const freightBillSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  referenceNo: { type: String, required: true, uppercase: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', index: true },
  carrierName: { type: String, trim: true },
  amount: { type: Number, required: true, min: 0 },
  account: { type: String, default: '5110', trim: true },
  invoiceDate: { type: Date },
  paymentMethod: { type: String, enum: ['cash', 'bank_transfer', 'mobile_money', 'on_account'], default: 'on_account' },
  status: { type: String, enum: ['draft', 'confirmed'], default: 'draft' },
  grnMatches: [grnMatchSchema],
  journalEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  confirmedAt: Date,
}, { timestamps: true });

freightBillSchema.index({ company: 1, referenceNo: 1 }, { unique: true });

module.exports = mongoose.model('FreightBill', freightBillSchema);
