const fs = require("fs");
const path = require("path");
const { Writable } = require("stream");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "bundle10-visual-secret";
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bundle10-visual";

const Company = require("../models/Company");
const Client = require("../models/Client");
const Product = require("../models/Product");
const Invoice = require("../models/Invoice");
const CreditNote = require("../models/CreditNote");
const EBMCode = require("../models/EBMCode");

const invoiceController = require("../controllers/invoiceController");
const creditNoteController = require("../controllers/creditNoteController");
const posController = require("../controllers/posController");

class CaptureResponse extends Writable {
  constructor() {
    super();
    this.chunks = [];
    this.headers = {};
    this.statusCode = 200;
    this.jsonPayload = null;
  }

  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  json(payload) {
    this.jsonPayload = payload;
    this.emit("finish");
    return this;
  }

  buffer() {
    return Buffer.concat(this.chunks);
  }
}

function capture(controller, req) {
  return new Promise((resolve, reject) => {
    const res = new CaptureResponse();
    res.on("finish", () => resolve(res));
    controller(req, res, reject);
  });
}

async function main() {
  const outputDir = path.join(__dirname, "..", "tmp", "bundle10-visual");
  fs.mkdirSync(outputDir, { recursive: true });

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const company = await Company.create({
    name: "Mock Kigali Trading Ltd",
    code: "MKTL",
    tax_identification_number: "999991130",
    registration_number: "999991130",
    base_currency: "RWF",
    is_vat_registered: true,
    address: { street: "KG 4 Ave", city: "Kigali", country: "Rwanda" },
    phone: "0780000000",
    email: "finance@example.rw",
  });
  const userId = new mongoose.Types.ObjectId();
  const categoryId = new mongoose.Types.ObjectId();
  const client = await Client.create({
    company: company._id,
    name: "Rwanda Buyer Ltd",
    code: "RBL",
    type: "company",
    taxId: "100000003",
    contact: { address: "KN 3 Rd, Kigali" },
  });
  const product = await Product.create({
    company: company._id,
    name: "Supplier laptop computers",
    sku: "LAP-001",
    category: categoryId,
    unit: "pcs",
    costPrice: 800000,
    sellingPrice: 1180000,
    createdBy: userId,
    ebm: {
      itemClassCd: "43211500",
      taxTyCd: "B",
      pkgUnitCd: "NT",
      qtyUnitCd: "U",
      isRegisteredWithEBM: true,
      ebmItemCode: "RW1NTXU0000001",
      ebmRegisteredAt: new Date(),
    },
  });
  await EBMCode.create({
    company: company._id,
    codeClass: "32",
    codeClassName: "Refund Reason",
    code: "06",
    name: "Refund",
    description: "Refund",
  });

  const salesPayload = {
    taxblAmtA: 0,
    taxblAmtB: 1000000,
    taxblAmtC: 0,
    taxblAmtD: 0,
    taxAmtA: 0,
    taxAmtB: 180000,
    taxAmtC: 0,
    taxAmtD: 0,
    totTaxblAmt: 1000000,
    totTaxAmt: 180000,
    totAmt: 1180000,
    itemList: [{
      itemSeq: 1,
      itemCd: "LAP-001",
      itemClsCd: "43211500",
      itemNm: "Supplier laptop computers",
      pkgUnitCd: "NT",
      qtyUnitCd: "U",
      qty: 1,
      prc: 1180000,
      taxTyCd: "B",
      taxblAmt: 1000000,
      taxAmt: 180000,
      totAmt: 1180000,
    }],
  };
  const invoice = await Invoice.create({
    company: company._id,
    client: client._id,
    customerName: client.name,
    customerTin: client.taxId,
    customerAddress: client.contact.address,
    status: "confirmed",
    currencyCode: "RWF",
    invoiceDate: new Date("2026-05-23T10:00:00Z"),
    dueDate: new Date("2026-05-30T10:00:00Z"),
    confirmedDate: new Date("2026-05-23T10:05:00Z"),
    confirmedBy: userId,
    createdBy: userId,
    lines: [{
      product: product._id,
      productName: product.name,
      productCode: product.sku,
      qty: 1,
      unit: "pcs",
      unitPrice: 1180000,
      taxCode: "B",
      taxRate: 18,
      lineSubtotal: 1000000,
      lineTax: 180000,
      lineTotal: 1180000,
    }],
    ebm: {
      ebmStatus: "submitted",
      rcptNo: "27",
      rcptDt: "20260523113045",
      intrlData: "GZGGIZLYTJSSD7YLYLGIIG6FCY",
      rcptSign: "TQZMKL57AGBMSTPOABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890FULLSIGNATURE",
      qrCode: "TQZMKL57AGBMSTPOABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890FULLSIGNATURE|GZGGIZLYTJSSD7YLYLGIIG6FCY|27|20260523113045",
      salesPayload,
    },
  });

  const pendingPos = await Invoice.create({
    company: company._id,
    client: client._id,
    customerName: "Walk-in Customer",
    currencyCode: "RWF",
    invoiceDate: new Date("2026-05-23T10:15:00Z"),
    dueDate: new Date("2026-05-23T10:15:00Z"),
    createdBy: userId,
    amountPaid: 1180000,
    payments: [{ amount: 1180000, paymentMethod: "cash", reference: "CASH-001", recordedBy: userId }],
    lines: [{
      product: product._id,
      productName: product.name,
      productCode: product.sku,
      qty: 1,
      unit: "pcs",
      unitPrice: 1180000,
      taxCode: "B",
      taxRate: 18,
      lineSubtotal: 1000000,
      lineTax: 180000,
      lineTotal: 1180000,
    }],
    ebm: { ebmStatus: "pending", salesPayload },
  });

  const creditPayload = { ...salesPayload, orgRcptNo: "27", rfdRsnCd: "06" };
  const creditNote = await CreditNote.create({
    company: company._id,
    invoice: invoice._id,
    client: client._id,
    reason: "Refund",
    type: "goods_return",
    createdBy: userId,
    lines: [{
      invoiceLineId: invoice.lines[0]._id,
      product: product._id,
      productName: product.name,
      productCode: product.sku,
      quantity: 1,
      originalQty: 1,
      unit: "pcs",
      unitPrice: 1180000,
      taxRate: 18,
      lineSubtotal: 1000000,
      lineTax: 180000,
      lineTotal: 1180000,
    }],
    ebm: {
      ebmStatus: "submitted",
      rcptNo: "28",
      rcptDt: "20260523114500",
      orgRcptNo: "27",
      rfdRsnCd: "06",
      intrlData: "CREDITINTERNALDATA1234567890",
      rcptSign: "CREDITNOTE-SIGNATURE-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      qrCode: "CREDITNOTE-SIGNATURE-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890|CREDITINTERNALDATA1234567890|28|20260523114500",
      salesPayload: creditPayload,
    },
  });

  const reqBase = { user: { id: userId, company: { _id: company._id } } };
  const invoiceRes = await capture(invoiceController.generateInvoicePDF, { ...reqBase, params: { id: invoice._id } });
  const invoicePdf = path.join(outputDir, "invoice-rra-sample.pdf");
  fs.writeFileSync(invoicePdf, invoiceRes.buffer());

  const creditRes = await capture(creditNoteController.generateCreditNotePDF, { ...reqBase, params: { id: creditNote._id } });
  const creditPdf = path.join(outputDir, "credit-note-rra-sample.pdf");
  fs.writeFileSync(creditPdf, creditRes.buffer());

  const posRes = await capture(posController.getReceipt, { ...reqBase, params: { id: pendingPos._id } });
  const posJson = path.join(outputDir, "pos-pending-receipt-sample.json");
  fs.writeFileSync(posJson, JSON.stringify(posRes.jsonPayload, null, 2));

  console.log(JSON.stringify({
    outputDir,
    invoicePdf,
    creditPdf,
    posJson,
    invoicePdfBytes: invoiceRes.buffer().length,
    creditPdfBytes: creditRes.buffer().length,
    posPending: posRes.jsonPayload?.data?.ebm,
  }, null, 2));

  await mongoose.disconnect();
  await mongod.stop();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
