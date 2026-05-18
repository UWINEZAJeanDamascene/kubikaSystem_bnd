/**
 * Migration: Correct MoMo direct-sale journal entries from 1100 (Cash at Bank)
 * to 1200 (MTN MoMo).
 *
 * Why: salesLegacyController.js was missing a `mobile_money` branch in the
 * cash-account selection, so MoMo payments fell through to the `else` clause
 * and debited 1100 instead of 1200.
 *
 * Scope: JournalEntry with sourceType='invoice' that has a line debiting 1100
 * AND the linked invoice has a payment with method 'mobile_money'.
 *
 * Run: node migrate-momo-1100-to-1200.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI not set in environment.");
  process.exit(1);
}

const OLD_CODE = "1100";
const NEW_CODE = "1200";
const NEW_NAME = "MTN MoMo";

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected.\n");

  const db = mongoose.connection.db;
  const jeCollection = db.collection("journalentries");
  const invCollection = db.collection("invoices");

  // Find candidate JEs: sourceType='invoice' with a line debiting 1100
  const candidateCursor = jeCollection.find({
    sourceType: "invoice",
    "lines.accountCode": OLD_CODE,
  });

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for await (const je of candidateCursor) {
    scanned++;

    // Look up the linked invoice (sourceId may be a string; convert to ObjectId)
    let sourceId = je.sourceId;
    if (typeof sourceId === "string" && mongoose.Types.ObjectId.isValid(sourceId)) {
      sourceId = new mongoose.Types.ObjectId(sourceId);
    }
    const invoice = await invCollection.findOne({ _id: sourceId });
    if (!invoice) {
      console.log(`  SKIP JE ${je.entryNumber || je._id}: invoice ${je.sourceId} not found`);
      skipped++;
      continue;
    }

    // Check if any payment on this invoice was mobile_money
    const hasMoMo = (invoice.payments || []).some(
      (p) =>
        p.paymentMethod === "mobile_money" ||
        p.paymentMethod === "momo" ||
        (typeof p.paymentMethod === "string" &&
          p.paymentMethod.toLowerCase().includes("momo"))
    );

    if (!hasMoMo) {
      // Not a MoMo sale — likely bank transfer or cheque; leave untouched
      continue;
    }

    // Update the 1100 line(s) to 1200
    let modified = false;
    const updatedLines = je.lines.map((line) => {
      if (line.accountCode === OLD_CODE) {
        modified = true;
        return {
          ...line,
          accountCode: NEW_CODE,
          accountName: NEW_NAME,
        };
      }
      return line;
    });

    if (modified) {
      await jeCollection.updateOne(
        { _id: je._id },
        { $set: { lines: updatedLines } }
      );
      updated++;
      console.log(
        `  UPDATED JE ${je.entryNumber || je._id} (Invoice ${invoice.invoiceNumber || invoice.referenceNo}): ${OLD_CODE} → ${NEW_CODE}`
      );
    }
  }

  console.log("\nMigration complete.");
  console.log(`  Scanned: ${scanned}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (invoice not found): ${skipped}`);

  await mongoose.disconnect();
  console.log("\nDisconnected.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
