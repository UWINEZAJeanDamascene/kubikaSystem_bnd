 /**
 * Backfill missing BankTransactions for posted journal entries.
 * Skips entries that already have a BankTransaction on the correct bank account.
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

const refTypeMap = {
  'invoice': 'Invoice',
  'invoice_payment': 'Payment',
  'expense': 'Expense',
  'purchase': 'Purchase',
  'purchase_order': 'PurchaseOrder',
  'purchase_return': 'PurchaseReturn',
  'grn': 'GRN',
  'petty_cash': 'PettyCashFloat',
  'petty_cash_expense': 'PettyCashExpense',
  'petty_cash_replenishment': 'PettyCashReplenishment',
  'petty_cash_topup': 'PettyCashReplenishment',
  'loan': 'Loan',
  'liability_drawdown': 'Loan',
  'liability_repayment': 'Loan',
  'payment': 'Payment',
  'bank_account': 'BankAccount',
  'bank_account_opening': 'BankAccount',
  'cash_account': 'CashAccount',
  'deferred_revenue': 'Payment',
  'deferred_revenue_recognition': 'Payment',
  'prepaid_expense': 'Expense',
  'prepaid_expense_recognition': 'Expense',
  'employee_advance': 'Payment',
  'employee_advance_repayment': 'Payment',
  'fixed_asset': 'Payment',
  'asset_purchase': 'Payment',
  'asset_disposal': 'Payment',
  'tax_accrual': 'Payment',
  'tax_payment': 'Payment',
  'payroll_salary': 'Payment',
  'payroll_employer': 'Payment',
  'opening_balance': 'BankAccount',
  'stock_adjustment': 'Payment',
  'cogs_adjustment': 'Payment',
  'stock_transfer': 'Payment',
  'manual': 'Payment',
  'journal_entry': 'Payment',
  'capital_injection': 'Payment',
  'credit_note': 'Payment',
  'credit_note_refund': 'Payment',
};

async function recomputeBalance(bankId) {
  const { BankAccount, BankTransaction } = require('../models/BankAccount');
  const bank = await BankAccount.findById(bankId);
  if (!bank) return;
  const txs = await BankTransaction.find({ account: bankId }).sort({ date: 1, _id: 1 }).lean();
  let bal = 0;
  for (const tx of txs) {
    if (['deposit', 'transfer_in', 'opening'].includes(tx.type)) bal += tx.amount;
    else if (['withdrawal', 'transfer_out', 'closing'].includes(tx.type)) bal -= tx.amount;
    else if (tx.type === 'adjustment' && tx.balanceAfter !== undefined) bal = parseFloat(tx.balanceAfter.toString());
    await BankTransaction.updateOne({ _id: tx._id }, { balanceAfter: mongoose.Types.Decimal128.fromString(bal.toString()) });
  }
  bank.cachedBalance = mongoose.Types.Decimal128.fromString(bal.toString());
  bank.cacheValid = false;
  await bank.save();
  console.log(`  ${bank.name}: ${bal.toFixed(2)} (${txs.length} txs)`);
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected\n');

  const { BankAccount, BankTransaction } = require('../models/BankAccount');
  const JournalEntry = require('../models/JournalEntry');
  const Company = require('../models/Company');

  const company = await Company.findOne({}).lean();
  const companyId = company._id;

  const banks = await BankAccount.find({ company: companyId, isActive: true }).lean();
  let totalCreated = 0, totalSkipped = 0;

  for (const bank of banks) {
    const bankId = bank._id;
    const ledgerCode = bank.ledgerAccountId || '1100';
    console.log(`\nProcessing ${bank.name} (ledger ${ledgerCode})`);

    const entries = await JournalEntry.find({
      company: companyId,
      status: 'posted',
      'lines.accountCode': ledgerCode,
    }).sort({ date: 1, entryNumber: 1 }).lean();

    let created = 0, skipped = 0;
    for (const entry of entries) {
      // Check existing by journalEntryId
      const existingByJE = await BankTransaction.findOne({
        account: bankId,
        journalEntryId: entry._id,
      }).lean();
      if (existingByJE) { skipped++; continue; }

      // Also check by sourceId/reference to catch controller-created ones
      // that don't have journalEntryId yet
      const sourceId = entry.sourceId || entry._id;
      if (sourceId) {
        const existingByRef = await BankTransaction.findOne({
          account: bankId,
          reference: sourceId,
          journalEntryId: { $in: [null, undefined] },
        }).lean();
        if (existingByRef) {
          // Link it up so future migrations skip it
          await BankTransaction.updateOne(
            { _id: existingByRef._id },
            { journalEntryId: entry._id }
          );
          skipped++;
          continue;
        }
      }

      // Check by amount + date + type
      const bankLine = entry.lines.find(l => l.accountCode === ledgerCode);
      if (!bankLine) continue;
      const debit = Number(bankLine.debit || 0);
      const credit = Number(bankLine.credit || 0);
      if (debit === 0 && credit === 0) continue;
      const type = debit > 0 ? 'deposit' : 'withdrawal';
      const amount = debit > 0 ? debit : credit;

      const start = new Date(entry.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const existingByAmtDate = await BankTransaction.findOne({
        account: bankId,
        type,
        amount,
        date: { $gte: start, $lt: end },
      }).lean();
      if (existingByAmtDate) {
        // Link it up
        await BankTransaction.updateOne(
          { _id: existingByAmtDate._id },
          { journalEntryId: entry._id }
        );
        skipped++;
        continue;
      }

      // Create missing BankTransaction
      const description = bankLine.description || entry.description || 'Auto-created transaction';
      const sourceType = (entry.sourceType || '').toLowerCase();
      const referenceType = refTypeMap[sourceType] || 'Payment';
      let reference = entry.sourceId || entry._id;
      if (reference && !mongoose.Types.ObjectId.isValid(String(reference))) {
        reference = entry._id;
      }

      try {
        await BankTransaction.create({
          account: bankId,
          company: companyId,
          type,
          amount,
          description,
          date: entry.date || new Date(),
          referenceNumber: entry.entryNumber || entry.sourceReference,
          referenceType,
          reference: reference || null,
          createdBy: entry.postedBy || entry.createdBy,
          notes: `Migrated from journal entry ${entry.entryNumber} — ${entry.description || ''}`,
          status: 'completed',
          journalEntryId: entry._id,
          balanceAfter: 0,
        });
        created++;
      } catch (err) {
        console.error(`    ERROR ${entry.entryNumber}: ${err.message}`);
      }
    }

    console.log(`  Created: ${created}, Skipped/linked: ${skipped}, Total JEs: ${entries.length}`);
    totalCreated += created;
    totalSkipped += skipped;

    await recomputeBalance(bankId);
  }

  console.log(`\n=== Done === Created: ${totalCreated}, Skipped/linked: ${totalSkipped}`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
