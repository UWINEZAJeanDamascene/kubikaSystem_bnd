require("dotenv").config();
const mongoose = require("mongoose");
const JournalEntry = require("../models/JournalEntry");
const { BankAccount, BankTransaction } = require("../models/BankAccount");
const bankTransactionService = require("../services/bankTransactionService");

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const bankAccounts = await BankAccount.find({ isActive: true }).select("company ledgerAccountId").lean();
  const companyCodes = new Map();
  for (const account of bankAccounts) {
    const key = String(account.company);
    if (!companyCodes.has(key)) companyCodes.set(key, new Set());
    companyCodes.get(key).add(String(account.ledgerAccountId || "1100"));
  }

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const [companyId, codes] of companyCodes.entries()) {
    const entries = await JournalEntry.find({
      company: companyId,
      status: "posted",
      "lines.accountCode": { $in: Array.from(codes) },
    }).sort({ date: 1, _id: 1 });

    for (const entry of entries) {
      for (const line of entry.lines) {
        if (!codes.has(String(line.accountCode))) continue;
        const existing = await BankTransaction.findOne({
          $and: [
            { $or: [{ companyId: entry.company }, { company: entry.company }] },
            { journalEntryId: entry._id },
            { journalEntryLineId: line._id },
          ],
        });
        if (existing) {
          skipped += 1;
          continue;
        }
        try {
          const result = await bankTransactionService.createFromJournalEntry(entry, {
            companyId: entry.company,
            userId: entry.createdBy || entry.postedBy,
          });
          created += result.length;
          break;
        } catch (error) {
          errors.push({ journalEntryId: entry._id.toString(), message: error.message });
        }
      }
    }
  }

  console.log(JSON.stringify({ created, skipped, errors }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
