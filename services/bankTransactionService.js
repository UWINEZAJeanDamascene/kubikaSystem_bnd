const { BankAccount, BankTransaction } = require("../models/BankAccount");

const bankAccountCache = new Map();

function toNumber(value) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value.toString) return Number(value.toString()) || 0;
  return Number(value) || 0;
}

function id(value) {
  return value && value._id ? value._id : value;
}

function normalizeId(value) {
  return value ? String(id(value)) : "";
}

function sourceDocumentType(sourceType = "") {
  const source = String(sourceType || "").toLowerCase();
  if (source.includes("invoice") || source === "ar_receipt" || source === "payment") return "invoice";
  if (source.includes("credit_note")) return "credit_note";
  if (source.includes("purchase_order")) return "purchase_order";
  if (source.includes("purchase")) return "direct_purchase";
  if (source.includes("payroll")) return "payroll_run";
  if (source.includes("loan")) return "loan";
  if (source.includes("bank_transfer")) return "bank_transfer";
  if (source.includes("manual") || source.includes("journal")) return "journal_entry";
  return "other";
}

function transactionTypeFor(sourceType = "", movementType) {
  const source = String(sourceType || "").toLowerCase();
  if (source.includes("bank_transfer")) return movementType === "debit" ? "bank_transfer_in" : "bank_transfer_out";
  if (source.includes("payroll")) return "payroll";
  if (source.includes("loan")) return movementType === "debit" ? "loan_receipt" : "loan_repayment";
  if (source.includes("purchase")) return "supplier_payment";
  if (source.includes("expense") || source.includes("tax_payment")) return "supplier_payment";
  if (source.includes("interest")) return movementType === "debit" ? "bank_interest" : "bank_charge";
  if (source.includes("deposit")) return "cash_deposit";
  if (source.includes("withdraw")) return "cash_withdrawal";
  if (source.includes("invoice") || source === "ar_receipt" || source === "payment") {
    return movementType === "debit" ? "customer_payment" : "other";
  }
  return "other";
}

function descriptionFor(entry, line, bankAccount, movementType, transactionType) {
  const reference = entry.sourceReference || entry.reference || entry.entryNumber || "";
  const sourceLabel = String(entry.sourceType || transactionType || "journal entry").replace(/_/g, " ");
  if (line.description) return String(line.description);
  if (transactionType === "bank_transfer_in") return `Transfer from bank account - ${reference || entry.entryNumber}`;
  if (transactionType === "bank_transfer_out") return `Transfer to bank account - ${reference || entry.entryNumber}`;
  if (transactionType === "customer_payment") return `Receipt - ${reference || entry.entryNumber}`;
  if (transactionType === "supplier_payment") return `Payment - ${reference || entry.entryNumber}`;
  if (transactionType === "payroll") return `Payroll - ${reference || entry.entryNumber}`;
  if (transactionType === "loan_receipt") return `Loan Receipt - ${reference || entry.entryNumber}`;
  if (transactionType === "loan_repayment") return `Loan Repayment - ${reference || entry.entryNumber}`;
  return `${movementType === "debit" ? "Receipt" : "Payment"} - ${sourceLabel} - ${reference || bankAccount.name || entry.entryNumber}`;
}

async function bankAccountsForCompany(companyId, session = null) {
  const cacheKey = normalizeId(companyId);
  if (!session && bankAccountCache.has(cacheKey)) return bankAccountCache.get(cacheKey);
  let query = BankAccount.find({ company: companyId, isActive: true }).select("_id company name ledgerAccountId isDefault");
  if (session) query = query.session(session);
  const accounts = await query.lean();
  if (!session) bankAccountCache.set(cacheKey, accounts);
  return accounts;
}

async function getBankAccountForLine(companyId, accountCode, context = {}) {
  if (!accountCode) return null;
  if (context.bankAccountId) {
    const query = BankAccount.findOne({ _id: context.bankAccountId, company: companyId, isActive: true });
    if (context.session) query.session(context.session);
    const account = await query.lean();
    if (account && String(account.ledgerAccountId) === String(accountCode)) return account;
  }
  const accounts = await bankAccountsForCompany(companyId, context.session);
  const matches = accounts.filter((account) => String(account.ledgerAccountId || "") === String(accountCode));
  if (matches.length === 0) return null;
  return matches.find((account) => account.isDefault) || matches[0];
}

async function latestBalance(companyId, bankAccountId, session = null) {
  let query = BankTransaction.findOne({
    $and: [
      { $or: [{ companyId }, { company: companyId }] },
      { $or: [{ bankAccountId }, { account: bankAccountId }] },
    ],
  }).sort({ date: -1, createdAt: -1, _id: -1 });
  if (session) query = query.session(session);
  const tx = await query.lean();
  return toNumber(tx?.balance ?? tx?.balanceAfter);
}

async function createFromJournalLine(entry, line, bankAccount, context = {}) {
  const companyId = id(context.companyId || entry.company);
  const bankAccountId = id(bankAccount._id);
  const journalEntryId = id(entry._id);
  const journalEntryLineId = id(line._id);
  const session = context.session || null;
  const debit = toNumber(line.debit);
  const credit = toNumber(line.credit);
  const movementType = debit > 0 ? "debit" : credit > 0 ? "credit" : null;
  const amount = movementType === "debit" ? debit : credit;
  if (!movementType || amount <= 0) return null;

  const existingQuery = BankTransaction.findOne({
    $and: [
      { $or: [{ companyId }, { company: companyId }] },
      { $or: [{ bankAccountId }, { account: bankAccountId }] },
    ],
    journalEntryId,
    journalEntryLineId,
  });
  if (session) existingQuery.session(session);
  const existing = await existingQuery;
  if (existing) return existing;

  const previousBalance = await latestBalance(companyId, bankAccountId, session);
  const balance = movementType === "debit" ? previousBalance + amount : previousBalance - amount;
  const txType = transactionTypeFor(entry.sourceType, movementType);
  const sourceType = sourceDocumentType(entry.sourceType);
  const sourceId = id(entry.sourceId || context.sourceId);

  const transaction = new BankTransaction({
    company: companyId,
    companyId,
    account: bankAccountId,
    bankAccountId,
    journalEntryId,
    journalEntryLineId,
    date: entry.date || new Date(),
    type: movementType,
    amount,
    balance,
    balanceAfter: balance,
    description: descriptionFor(entry, line, bankAccount, movementType, txType),
    reference: sourceId || journalEntryId,
    referenceNumber: entry.sourceReference || entry.reference || entry.entryNumber,
    sourceReference: entry.sourceReference || entry.reference || entry.entryNumber,
    transactionType: txType,
    sourceDocumentType: sourceType,
    sourceDocumentId: sourceId || null,
    reconciliationStatus: "unreconciled",
    status: "completed",
    createdBy: context.userId || entry.createdBy || entry.postedBy,
  });
  return transaction.save({ session });
}

async function createFromJournalEntry(entry, context = {}) {
  if (!entry || !Array.isArray(entry.lines)) return [];
  const created = [];
  for (const line of entry.lines) {
    const bankAccount = await getBankAccountForLine(context.companyId || entry.company, line.accountCode, context);
    if (!bankAccount) continue;
    const tx = await createFromJournalLine(entry, line, bankAccount, context);
    if (tx) created.push(tx);
  }
  return created;
}

function clearCache(companyId = null) {
  if (companyId) bankAccountCache.delete(normalizeId(companyId));
  else bankAccountCache.clear();
}

module.exports = {
  createFromJournalEntry,
  createFromJournalLine,
  clearCache,
};
