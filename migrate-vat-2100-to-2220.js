/**
 * Migration: Correct VAT account code from 2100 (legacy VAT Payable)
 * to 2220 (VAT Output) for sales-related journal entries.
 *
 * Why: invoiceController.js and journalService.js were mapping sales VAT
 * to "vatPayable" (2100) instead of "vatOutput" (2220). This script
 * fixes already-posted entries so the Balance Sheet and Tax Reports
 * reflect the correct modern account.
 *
 * Run: node migrate-vat-2100-to-2220.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI not set in environment.");
  process.exit(1);
}

const SALES_SOURCE_TYPES = ["invoice", "credit_note"];
const OLD_CODE = "2100";
const NEW_CODE = "2220";
const NEW_NAME = "VAT Output";

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected.\n");

  const db = mongoose.connection.db;
  const journalCollection = db.collection("journalentries");
  const taxTxCollection = db.collection("taxtransactions");

  // ── 1. Journal Entries ─────────────────────────────────────────────
  console.log("Step 1: Updating JournalEntry lines...");

  const jeFilter = {
    sourceType: { $in: SALES_SOURCE_TYPES },
    "lines.accountCode": OLD_CODE,
  };

  const jeCursor = journalCollection.find(jeFilter);
  let jeUpdated = 0;
  let jeTotal = 0;

  for await (const doc of jeCursor) {
    jeTotal++;
    let modified = false;
    const updatedLines = doc.lines.map((line) => {
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
      await journalCollection.updateOne(
        { _id: doc._id },
        { $set: { lines: updatedLines } }
      );
      jeUpdated++;
      console.log(
        `  Updated JE ${doc.entryNumber || doc._id} (${doc.sourceType})`
      );
    }
  }

  console.log(
    `  JournalEntries scanned: ${jeTotal}, updated: ${jeUpdated}\n`
  );

  // ── 2. Tax Transactions ──────────────────────────────────────────
  console.log("Step 2: Updating TaxTransaction records...");

  const txFilter = {
    sourceType: { $in: SALES_SOURCE_TYPES },
    accountCode: OLD_CODE,
  };

  const txResult = await taxTxCollection.updateMany(txFilter, {
    $set: { accountCode: NEW_CODE },
  });

  console.log(
    `  TaxTransactions matched: ${txResult.matchedCount}, modified: ${txResult.modifiedCount}\n`
  );

  // ── 3. Summary ───────────────────────────────────────────────────
  console.log("Migration complete.");
  console.log(`  ${jeUpdated} journal entries updated.`);
  console.log(`  ${txResult.modifiedCount} tax transactions updated.`);

  await mongoose.disconnect();
  console.log("\nDisconnected.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
