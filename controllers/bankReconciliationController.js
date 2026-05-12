const { BankAccount, BankStatementLine, BankReconciliationMatch, BankReconciliation } = require("../models/BankAccount");
const JournalEntry = require("../models/JournalEntry");
const JournalService = require("../services/journalService");
const mongoose = require("mongoose");
const { DEFAULT_ACCOUNTS } = require("../constants/chartOfAccounts");

function parseDateAuto(value) {
  if (!value || typeof value !== "string") {
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const str = value.trim();
  const isoMatch = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10), m = parseInt(isoMatch[2], 10), d = parseInt(isoMatch[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const date = new Date(y, m - 1, d);
      if (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) return date;
    }
  }
  const euroMatch = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (euroMatch) {
    const p1 = parseInt(euroMatch[1], 10), p2 = parseInt(euroMatch[2], 10), y = parseInt(euroMatch[3], 10);
    if (p1 > 12 && p1 <= 31 && p2 >= 1 && p2 <= 12) {
      const date = new Date(y, p2 - 1, p1);
      if (date.getFullYear() === y && date.getMonth() === p2 - 1 && date.getDate() === p1) return date;
    }
    if (p2 > 12 && p2 <= 31 && p1 >= 1 && p1 <= 12) {
      const date = new Date(y, p1 - 1, p2);
      if (date.getFullYear() === y && date.getMonth() === p1 - 1 && date.getDate() === p2) return date;
    }
    if (p1 >= 1 && p1 <= 31 && p2 >= 1 && p2 <= 12) {
      const date = new Date(y, p2 - 1, p1);
      if (date.getFullYear() === y && date.getMonth() === p2 - 1 && date.getDate() === p1) return date;
    }
  }
  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function parseDate(value, format = "auto") {
  if (format === "auto") return parseDateAuto(value);
  if (!value || typeof value !== "string") {
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const str = value.trim();
  const parts = str.split(/[-\/\.]/);
  if (parts.length !== 3) {
    const fallback = new Date(str);
    return isNaN(fallback.getTime()) ? null : fallback;
  }
  let day, month, year;
  if (format === "DD/MM/YYYY" || format === "DD-MM-YYYY") { day = parseInt(parts[0], 10); month = parseInt(parts[1], 10); year = parseInt(parts[2], 10); }
  else if (format === "MM/DD/YYYY" || format === "MM-DD-YYYY") { month = parseInt(parts[0], 10); day = parseInt(parts[1], 10); year = parseInt(parts[2], 10); }
  else if (format === "YYYY-MM-DD" || format === "YYYY/MM/DD") { year = parseInt(parts[0], 10); month = parseInt(parts[1], 10); day = parseInt(parts[2], 10); }
  else return parseDateAuto(value);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date;
  return null;
}

function toDecimal(value) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value === "object") {
    if (value.$numberDecimal) return Number(value.$numberDecimal);
    if (value.toString) try { return Number(value.toString()); } catch (e) { return 0; }
  }
  return Number(value) || 0;
}

function roundMoney(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }

function coerceDecimal128(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  if (v && typeof v === "object") {
    if (v.$numberDecimal) return Number(v.$numberDecimal);
    try { return Number(v.toString()); } catch (e) { return 0; }
  }
  return Number(v) || 0;
}

// =====================================================
// 1. START RECONCILIATION SESSION
// =====================================================
exports.startReconciliation = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { statementDateStart, statementDateEnd, statementClosingBalance, notes } = req.body;

    const account = await BankAccount.findOne({ _id: req.params.id, company: companyId });
    if (!account) return res.status(404).json({ success: false, message: "Bank account not found" });

    if (!statementDateStart || !statementDateEnd || statementClosingBalance === undefined) {
      return res.status(400).json({ success: false, message: "statementDateStart, statementDateEnd, and statementClosingBalance are required" });
    }

    const startDate = parseDate(statementDateStart);
    const endDate = parseDate(statementDateEnd);
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: "Invalid date format. Use DD/MM/YYYY, MM/DD/YYYY, or YYYY-MM-DD" });
    }

    // Check for existing in-progress reconciliation
    const existing = await BankReconciliation.findOne({ bankAccount: account._id, company: companyId, status: { $in: ["draft", "in_progress"] } });
    if (existing) {
      return res.status(400).json({ success: false, message: "An in-progress reconciliation already exists. Complete or cancel it first.", data: { reconciliationId: existing._id } });
    }

    const closingBal = parseFloat(statementClosingBalance);

    // Compute book balance from journal entries up to endDate
    const ledgerAccountId = account.ledgerAccountId || "1100";
    const agg = await JournalEntry.aggregate([
      { $match: { company: new mongoose.Types.ObjectId(String(companyId)), status: "posted", date: { $lte: endDate } } },
      { $unwind: "$lines" },
      { $match: { "lines.accountCode": ledgerAccountId } },
      { $group: { _id: null, totalDebits: { $sum: { $toDouble: { $ifNull: ["$lines.debit", 0] } } }, totalCredits: { $sum: { $toDouble: { $ifNull: ["$lines.credit", 0] } } } } }
    ]).allowDiskUse(true);

    const totalDebits = agg && agg[0] ? agg[0].totalDebits || 0 : 0;
    const totalCredits = agg && agg[0] ? agg[0].totalCredits || 0 : 0;
    const openingBalance = coerceDecimal128(account.openingBalance);
    const bookBalance = openingBalance + totalDebits - totalCredits;

    const reconciliation = new BankReconciliation({
      bankAccount: account._id,
      company: companyId,
      statementDateStart: startDate,
      statementDateEnd: endDate,
      statementClosingBalance: mongoose.Types.Decimal128.fromString(closingBal.toFixed(2)),
      bookClosingBalance: mongoose.Types.Decimal128.fromString(bookBalance.toFixed(2)),
      difference: mongoose.Types.Decimal128.fromString((closingBal - bookBalance).toFixed(2)),
      status: "in_progress",
      startedBy: req.user._id,
      notes: notes || null,
    });

    await reconciliation.save();

    res.status(201).json({
      success: true,
      data: {
        reconciliationId: reconciliation._id,
        bankAccount: { id: account._id, name: account.name, ledgerAccountId },
        statementDateStart: startDate,
        statementDateEnd: endDate,
        statementClosingBalance: closingBal,
        bookClosingBalance: roundMoney(bookBalance),
        difference: roundMoney(closingBal - bookBalance),
        status: "in_progress",
      },
      message: "Reconciliation session started",
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// 2. GET RECONCILIATION DATA (both sides)
// =====================================================
exports.getReconciliationData = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { reconciliationId } = req.query;

    const account = await BankAccount.findOne({ _id: req.params.id, company: companyId });
    if (!account) return res.status(404).json({ success: false, message: "Bank account not found" });

    let reconciliation;
    if (reconciliationId) {
      reconciliation = await BankReconciliation.findOne({ _id: reconciliationId, bankAccount: account._id, company: companyId });
    } else {
      reconciliation = await BankReconciliation.findOne({ bankAccount: account._id, company: companyId, status: { $in: ["draft", "in_progress"] } }).sort({ startedAt: -1 });
    }

    if (!reconciliation) {
      return res.status(404).json({ success: false, message: "No active reconciliation found. Start one first." });
    }

    const ledgerAccountId = account.ledgerAccountId || "1100";
    const endDate = reconciliation.statementDateEnd;

    // LEFT SIDE: Journal lines that hit this bank account and are NOT reconciled in a completed reconciliation
    // A journal line is "available" if it has no BankReconciliationMatch where the match's reconciliation is completed,
    // OR if it has a match in the CURRENT reconciliation.
    const allJournalEntries = await JournalEntry.find({
      company: companyId,
      status: "posted",
      date: { $lte: endDate },
      lines: { $elemMatch: { accountCode: ledgerAccountId } },
    }).lean();

    // Get all matches for this bank account
    const allMatches = await BankReconciliationMatch.find({
      company: companyId,
      bankAccount: account._id,
    }).lean();

    // Build a map of lineId -> match
    const lineMatches = {};
    for (const m of allMatches) {
      const lineId = m.journalEntryLineId.toString();
      if (!lineMatches[lineId]) lineMatches[lineId] = [];
      lineMatches[lineId].push(m);
    }

    // For each journal line, determine if it's available
    const journalLines = [];
    let bookDebits = 0, bookCredits = 0;
    for (const entry of allJournalEntries) {
      for (const line of entry.lines) {
        if (line.accountCode !== ledgerAccountId) continue;
        const lineIdStr = line._id ? line._id.toString() : null;
        const debit = coerceDecimal128(line.debit);
        const credit = coerceDecimal128(line.credit);
        bookDebits += debit;
        bookCredits += credit;

        const matches = lineIdStr ? (lineMatches[lineIdStr] || []) : [];
        // If any match belongs to a completed reconciliation (other than current), line is not available
        const completedOtherMatch = matches.find(m => {
          // We don't have reconciliationId on match, so we check if statement line is reconciled in a completed reconciliation
          // For now, if the journal entry line itself has reconciled=true and isLocked, it's from a completed reconciliation
          return entry.reconciliationStatus === "reconciled" && entry.isLocked;
        });

        if (completedOtherMatch) continue; // Skip - already reconciled in a completed session

        const isMatchedInCurrent = matches.length > 0;
        const amount = debit || credit;
        journalLines.push({
          type: "journal",
          journalEntryId: entry._id,
          lineId: line._id,
          entryNumber: entry.entryNumber,
          date: entry.date,
          description: line.description || entry.description,
          debit: roundMoney(debit),
          credit: roundMoney(credit),
          amount: roundMoney(amount),
          isDebit: debit > 0,
          reconciled: isMatchedInCurrent,
          matchIds: matches.map(m => m._id),
          matchedStatementLineIds: matches.map(m => m.bankStatementLine),
          sourceType: entry.sourceType,
          isLocked: entry.isLocked || false,
        });
      }
    }

    // RIGHT SIDE: Statement lines belonging to this reconciliation (or all unreconciled if no reconciliationId assigned yet)
    const statementQuery = { bankAccount: account._id };
    if (reconciliation.status === "in_progress" || reconciliation.status === "draft") {
      // Get statement lines imported up to endDate that are not already reconciled in a completed reconciliation
      statementQuery.transactionDate = { $lte: endDate };
      // Also include lines already assigned to this reconciliation
      statementQuery.$or = [
        { reconciliationId: reconciliation._id },
        { reconciliationId: null, isReconciled: false },
      ];
    }

    const statementLines = await BankStatementLine.find(statementQuery).sort({ transactionDate: 1 }).lean();

    const bankLines = [];
    let lastStatementBalance = 0;
    for (const line of statementLines) {
      const debit = coerceDecimal128(line.debitAmount);
      const credit = coerceDecimal128(line.creditAmount);
      const amount = credit - debit; // positive = money in, negative = money out
      if (line.balance != null) lastStatementBalance = coerceDecimal128(line.balance);

      const matches = await BankReconciliationMatch.find({ bankStatementLine: line._id, company: companyId }).lean();
      const totalMatched = matches.reduce((sum, m) => sum + coerceDecimal128(m.matchedAmount), 0);
      const isFullyMatched = Math.abs(totalMatched - Math.abs(amount)) < 0.01;

      bankLines.push({
        type: "bank",
        id: line._id,
        date: line.transactionDate,
        description: line.description,
        debit: roundMoney(debit),
        credit: roundMoney(credit),
        amount: roundMoney(Math.abs(amount)),
        isDebit: amount < 0,
        balance: line.balance != null ? roundMoney(coerceDecimal128(line.balance)) : null,
        reference: line.reference,
        reconciled: isFullyMatched,
        status: line.status,
        matchedAmount: roundMoney(totalMatched),
        matchIds: matches.map(m => m._id),
      });
    }

    // Compute balances
    const openingBalance = coerceDecimal128(account.openingBalance);
    const bookBalance = openingBalance + bookDebits - bookCredits;

    const unreconciledJournalDR = journalLines.filter(l => !l.reconciled && l.isDebit).reduce((s, l) => s + l.amount, 0);
    const unreconciledJournalCR = journalLines.filter(l => !l.reconciled && !l.isDebit).reduce((s, l) => s + l.amount, 0);
    const unreconciledBankCredits = bankLines.filter(l => !l.reconciled && !l.isDebit).reduce((s, l) => s + l.amount, 0);
    const unreconciledBankDebits = bankLines.filter(l => !l.reconciled && l.isDebit).reduce((s, l) => s + l.amount, 0);

    const adjustedBankBalance = lastStatementBalance + unreconciledJournalDR - unreconciledJournalCR;
    const adjustedBookBalance = bookBalance + unreconciledBankCredits - unreconciledBankDebits;
    const difference = adjustedBankBalance - adjustedBookBalance;

    res.json({
      success: true,
      data: {
        reconciliationId: reconciliation._id,
        status: reconciliation.status,
        period: {
          start: reconciliation.statementDateStart,
          end: reconciliation.statementDateEnd,
        },
        statementClosingBalance: roundMoney(coerceDecimal128(reconciliation.statementClosingBalance)),
        bookClosingBalance: roundMoney(coerceDecimal128(reconciliation.bookClosingBalance)),
        // Left side
        journalLines,
        journalSummary: {
          totalLines: journalLines.length,
          reconciledCount: journalLines.filter(l => l.reconciled).length,
          unreconciledCount: journalLines.filter(l => !l.reconciled).length,
          totalDebits: roundMoney(bookDebits),
          totalCredits: roundMoney(bookCredits),
          bookBalance: roundMoney(bookBalance),
        },
        // Right side
        bankLines,
        bankSummary: {
          totalLines: bankLines.length,
          reconciledCount: bankLines.filter(l => l.reconciled).length,
          unreconciledCount: bankLines.filter(l => !l.reconciled).length,
          lastStatementBalance: roundMoney(lastStatementBalance),
        },
        // Key numbers
        summary: {
          depositsInTransit: roundMoney(unreconciledJournalDR),
          outstandingChecks: roundMoney(unreconciledJournalCR),
          bankCreditsNotInBooks: roundMoney(unreconciledBankCredits),
          bankChargesNotInBooks: roundMoney(unreconciledBankDebits),
          adjustedBankBalance: roundMoney(adjustedBankBalance),
          adjustedBookBalance: roundMoney(adjustedBookBalance),
          difference: roundMoney(difference),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// 3. SUGGEST MATCHES (auto-match suggestions)
// =====================================================
exports.suggestMatches = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { reconciliationId } = req.query;

    const account = await BankAccount.findOne({ _id: req.params.id, company: companyId });
    if (!account) return res.status(404).json({ success: false, message: "Bank account not found" });

    let reconciliation;
    if (reconciliationId) {
      reconciliation = await BankReconciliation.findOne({ _id: reconciliationId, bankAccount: account._id, company: companyId });
    } else {
      reconciliation = await BankReconciliation.findOne({ bankAccount: account._id, company: companyId, status: { $in: ["draft", "in_progress"] } }).sort({ startedAt: -1 });
    }
    if (!reconciliation) return res.status(404).json({ success: false, message: "No active reconciliation found" });

    const ledgerAccountId = account.ledgerAccountId || "1100";
    const endDate = reconciliation.statementDateEnd;

    const journalEntries = await JournalEntry.find({
      company: companyId,
      status: "posted",
      date: { $lte: endDate },
      lines: { $elemMatch: { accountCode: ledgerAccountId } },
      isLocked: { $ne: true },
      reconciliationStatus: { $ne: "reconciled" },
    }).lean();

    const availableJournalLines = [];
    for (const entry of journalEntries) {
      for (const line of entry.lines) {
        if (line.accountCode !== ledgerAccountId) continue;
        const matches = await BankReconciliationMatch.find({ journalEntryLineId: line._id }).lean();
        if (matches.length > 0) continue;
        const debit = coerceDecimal128(line.debit);
        const credit = coerceDecimal128(line.credit);
        availableJournalLines.push({
          journalEntryId: entry._id,
          lineId: line._id,
          entryNumber: entry.entryNumber,
          date: entry.date,
          description: (line.description || entry.description || "").toLowerCase(),
          amount: roundMoney(debit || credit),
          isDebit: debit > 0,
        });
      }
    }

    const statementLines = await BankStatementLine.find({
      bankAccount: account._id,
      isReconciled: false,
      transactionDate: { $lte: endDate },
      $or: [{ reconciliationId: reconciliation._id }, { reconciliationId: null }],
    }).lean();

    const suggestions = [];
    for (const stmt of statementLines) {
      const stmtDebit = coerceDecimal128(stmt.debitAmount);
      const stmtCredit = coerceDecimal128(stmt.creditAmount);
      const stmtAmount = roundMoney(stmtCredit || stmtDebit);
      const stmtIsDebit = stmtDebit > 0;
      for (const cand of availableJournalLines) {
        if (cand.isDebit !== stmtIsDebit || Math.abs(cand.amount - stmtAmount) >= 0.01) continue;
        let score = 50;
        const daysDiff = Math.abs((new Date(stmt.transactionDate) - new Date(cand.date)) / (1000 * 60 * 60 * 24));
        if (daysDiff <= 1) score += 30;
        else if (daysDiff <= 7) score += 20;
        else if (daysDiff <= 30) score += 10;
        const stmtWords = new Set((stmt.description || "").toLowerCase().split(/\s+/));
        const overlap = cand.description.split(/\s+/).filter(w => stmtWords.has(w)).length;
        if (overlap > 2) score += 15; else if (overlap > 0) score += 5;
        if (stmt.reference && cand.entryNumber && stmt.reference.toLowerCase().includes(cand.entryNumber.toLowerCase())) score += 10;
        suggestions.push({ statementLineId: stmt._id, journalEntryId: cand.journalEntryId, journalLineId: cand.lineId, score: Math.min(score, 100), matchType: "exact_amount", details: { statementAmount: stmtAmount, journalAmount: cand.amount, daysDiff: Math.round(daysDiff), statementDescription: stmt.description, journalDescription: cand.description } });
      }
    }
    suggestions.sort((a, b) => b.score - a.score);

    res.json({ success: true, data: suggestions.slice(0, 100), summary: { totalStatementLines: statementLines.length, totalJournalLines: availableJournalLines.length, suggestionsCount: suggestions.length } });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// 4. MATCH ITEMS (user-approved only)
// =====================================================
exports.matchItems = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { reconciliationId, journalEntryId, journalLineId, statementLineId } = req.body;
    if (!journalEntryId || !statementLineId) return res.status(400).json({ success: false, message: "journalEntryId and statementLineId are required" });

    const account = await BankAccount.findOne({ _id: req.params.id, company: companyId });
    if (!account) return res.status(404).json({ success: false, message: "Bank account not found" });

    let reconciliation;
    if (reconciliationId) {
      reconciliation = await BankReconciliation.findOne({ _id: reconciliationId, bankAccount: account._id, company: companyId });
    } else {
      reconciliation = await BankReconciliation.findOne({ bankAccount: account._id, company: companyId, status: { $in: ["draft", "in_progress"] } }).sort({ startedAt: -1 });
    }
    if (!reconciliation) return res.status(404).json({ success: false, message: "No active reconciliation found" });

    const ledgerAccountId = account.ledgerAccountId || "1100";
    const journalEntry = await JournalEntry.findOne({ _id: journalEntryId, company: companyId, status: "posted" });
    if (!journalEntry) return res.status(404).json({ success: false, message: "Journal entry not found" });

    let targetLine = null, targetLineIndex = -1, targetLineId = null;
    if (journalLineId) {
      for (let i = 0; i < journalEntry.lines.length; i++) {
        if (journalEntry.lines[i]._id && journalEntry.lines[i]._id.toString() === journalLineId) {
          targetLine = journalEntry.lines[i]; targetLineIndex = i; targetLineId = journalEntry.lines[i]._id; break;
        }
      }
    } else {
      for (let i = 0; i < journalEntry.lines.length; i++) {
        if (journalEntry.lines[i].accountCode === ledgerAccountId) {
          targetLine = journalEntry.lines[i]; targetLineIndex = i; targetLineId = journalEntry.lines[i]._id; break;
        }
      }
    }
    if (!targetLine || targetLineIndex === -1 || !targetLineId) return res.status(400).json({ success: false, message: "Journal entry line not found for this bank account" });
    if (journalEntry.isLocked) return res.status(400).json({ success: false, message: "This journal entry is locked (already reconciled). It cannot be modified." });

    const statementLine = await BankStatementLine.findOne({ _id: statementLineId, bankAccount: account._id });
    if (!statementLine) return res.status(404).json({ success: false, message: "Bank statement line not found" });

    const existingMatch = await BankReconciliationMatch.findOne({ bankStatementLine: statementLineId, journalEntryLineId: targetLineId });
    if (existingMatch) return res.status(400).json({ success: false, message: "This match already exists" });

    const stmtAmount = Math.abs(coerceDecimal128(statementLine.creditAmount) || coerceDecimal128(statementLine.debitAmount));
    const lineAmount = Math.abs(coerceDecimal128(targetLine.debit) || coerceDecimal128(targetLine.credit));

    const match = new BankReconciliationMatch({
      bankStatementLine: statementLineId, journalEntryLineId: targetLineId, journalEntry: journalEntryId,
      bankAccount: account._id, company: companyId, matchedBy: req.user._id,
      matchedAmount: mongoose.Types.Decimal128.fromString(lineAmount.toFixed(2)),
    });
    await match.save();

    const matchesForStatement = await BankReconciliationMatch.find({ bankStatementLine: statementLineId }).lean();
    let totalMatched = 0;
    for (const m of matchesForStatement) totalMatched += coerceDecimal128(m.matchedAmount);
    const isFullyReconciled = Math.abs(totalMatched - stmtAmount) < 0.01;
    statementLine.isReconciled = isFullyReconciled;
    statementLine.status = isFullyReconciled ? "matched" : "unmatched";
    statementLine.matchedAmount = totalMatched > 0 ? mongoose.Types.Decimal128.fromString(totalMatched.toFixed(2)) : null;
    await statementLine.save();

    journalEntry.lines[targetLineIndex].reconciled = true;
    journalEntry.lines[targetLineIndex].matchedStatementLineId = statementLineId;
    await journalEntry.save();

    res.json({
      success: true,
      message: isFullyReconciled ? "Match created and statement line fully reconciled" : "Match created. Statement line partially matched (amounts do not match exactly).",
      data: { matchId: match._id, journalEntryId, journalLineId: targetLineId, statementLineId, isFullyReconciled, matchedAmount: roundMoney(totalMatched), statementAmount: roundMoney(stmtAmount), difference: roundMoney(stmtAmount - totalMatched) },
    });
  } catch (error) { next(error); }
};

// =====================================================
// 5. UNMATCH ITEMS
// =====================================================
exports.unmatchItems = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { matchId } = req.body;
    if (!matchId) return res.status(400).json({ success: false, message: "matchId is required" });

    const match = await BankReconciliationMatch.findOne({ _id: matchId, company: companyId });
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });

    const statementLine = await BankStatementLine.findById(match.bankStatementLine);
    const journalEntry = await JournalEntry.findById(match.journalEntry);
    if (!statementLine || !journalEntry) return res.status(404).json({ success: false, message: "Related records not found" });
    if (journalEntry.isLocked) return res.status(400).json({ success: false, message: "This journal entry is locked (reconciliation completed). Unmatch is not allowed." });

    await BankReconciliationMatch.findByIdAndDelete(matchId);

    const otherMatches = await BankReconciliationMatch.findOne({ journalEntryLineId: match.journalEntryLineId });
    if (!otherMatches) {
      const lineIndex = journalEntry.lines.findIndex(l => l._id && l._id.toString() === match.journalEntryLineId.toString());
      if (lineIndex !== -1) { journalEntry.lines[lineIndex].reconciled = false; journalEntry.lines[lineIndex].matchedStatementLineId = null; await journalEntry.save(); }
    }

    const remainingMatches = await BankReconciliationMatch.find({ bankStatementLine: match.bankStatementLine }).lean();
    const stmtAmount = Math.abs(coerceDecimal128(statementLine.creditAmount) || coerceDecimal128(statementLine.debitAmount));
    let totalMatched = 0;
    for (const m of remainingMatches) totalMatched += coerceDecimal128(m.matchedAmount);
    const isFullyReconciled = Math.abs(totalMatched - stmtAmount) < 0.01;
    statementLine.isReconciled = isFullyReconciled;
    statementLine.matchedAmount = totalMatched > 0 ? mongoose.Types.Decimal128.fromString(totalMatched.toFixed(2)) : null;
    await statementLine.save();

    res.json({ success: true, message: "Match removed successfully", data: { remainingMatches: remainingMatches.length, isFullyReconciled } });
  } catch (error) { next(error); }
};

// =====================================================
// 6. IGNORE STATEMENT LINE
// =====================================================
exports.ignoreStatementLine = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { statementLineId } = req.body;
    const account = await BankAccount.findOne({ _id: req.params.id, company: companyId });
    if (!account) return res.status(404).json({ success: false, message: "Bank account not found" });
    const statementLine = await BankStatementLine.findOne({ _id: statementLineId, bankAccount: account._id });
    if (!statementLine) return res.status(404).json({ success: false, message: "Statement line not found" });
    if (statementLine.status === "matched") return res.status(400).json({ success: false, message: "Cannot ignore a matched line. Unmatch it first." });
    statementLine.status = "ignored";
    await statementLine.save();
    res.json({ success: true, message: "Statement line marked as ignored", data: { statementLineId } });
  } catch (error) { next(error); }
};

// =====================================================
// 7. CREATE ADJUSTING ENTRY (user-explicit only)
// =====================================================
exports.createAdjustingEntry = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { reconciliationId, statementLineId, expenseAccountCode, description, date } = req.body;

    const account = await BankAccount.findOne({ _id: req.params.id, company: companyId });
    if (!account) return res.status(404).json({ success: false, message: "Bank account not found" });

    let reconciliation;
    if (reconciliationId) {
      reconciliation = await BankReconciliation.findOne({ _id: reconciliationId, bankAccount: account._id, company: companyId });
    } else {
      reconciliation = await BankReconciliation.findOne({ bankAccount: account._id, company: companyId, status: { $in: ["draft", "in_progress"] } }).sort({ startedAt: -1 });
    }
    if (!reconciliation) return res.status(404).json({ success: false, message: "No active reconciliation found" });

    const statementLine = await BankStatementLine.findOne({ _id: statementLineId, bankAccount: account._id });
    if (!statementLine) return res.status(404).json({ success: false, message: "Statement line not found" });
    if (statementLine.status === "matched") return res.status(400).json({ success: false, message: "Cannot create adjusting entry for a matched line" });

    const ledgerAccountId = account.ledgerAccountId || "1100";
    const stmtDebit = coerceDecimal128(statementLine.debitAmount);
    const stmtCredit = coerceDecimal128(statementLine.creditAmount);
    const stmtAmount = Math.abs(stmtCredit || stmtDebit);
    const isDebit = stmtDebit > 0;

    const entryDate = date ? parseDate(date) : statementLine.transactionDate;
    const narration = description || `Bank adjustment: ${statementLine.description || statementLineId}`;

    const lines = [];
    if (isDebit) {
      // Bank charge/expense: DR expense, CR bank
      const expenseCode = expenseAccountCode || DEFAULT_ACCOUNTS.bankCharges || "6200";
      lines.push(JournalService.createDebitLine(expenseCode, stmtAmount, narration));
      lines.push(JournalService.createCreditLine(ledgerAccountId, stmtAmount, narration));
    } else {
      // Bank receipt: DR bank, CR other income or suspense
      const incomeCode = expenseAccountCode || DEFAULT_ACCOUNTS.otherIncome || "4200";
      lines.push(JournalService.createDebitLine(ledgerAccountId, stmtAmount, narration));
      lines.push(JournalService.createCreditLine(incomeCode, stmtAmount, narration));
    }

    const journalEntry = await JournalService.createEntry(companyId, req.user._id, {
      date: entryDate,
      description: narration,
      sourceType: "bank_adjustment",
      sourceId: statementLine._id,
      sourceReference: `ADJ-${account.name}-${statementLine._id.toString().slice(-6)}`,
      lines,
      isReconciliationAdjustingEntry: true,
      isAutoGenerated: false,
    });

    // Update statement line to show it has been explained
    statementLine.status = "matched";
    statementLine.isReconciled = true;
    await statementLine.save();

    res.status(201).json({
      success: true,
      message: "Adjusting journal entry created successfully",
      data: {
        journalEntryId: journalEntry._id,
        entryNumber: journalEntry.entryNumber,
        statementLineId,
        amount: roundMoney(stmtAmount),
        isDebit,
        lines: journalEntry.lines,
      },
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// 8. COMPLETE RECONCILIATION (only if difference = 0)
// =====================================================
exports.completeReconciliation = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { reconciliationId, notes, force } = req.body;

    const account = await BankAccount.findOne({ _id: req.params.id, company: companyId });
    if (!account) return res.status(404).json({ success: false, message: "Bank account not found" });

    const reconciliation = await BankReconciliation.findOne({
      _id: reconciliationId || { $exists: true },
      bankAccount: account._id,
      company: companyId,
      status: { $in: ["draft", "in_progress"] },
    }).sort({ startedAt: -1 });

    if (!reconciliation) return res.status(404).json({ success: false, message: "No active reconciliation found" });

    // Get current state
    const ledgerAccountId = account.ledgerAccountId || "1100";
    const endDate = reconciliation.statementDateEnd;

    // Recompute book balance
    const agg = await JournalEntry.aggregate([
      { $match: { company: new mongoose.Types.ObjectId(String(companyId)), status: "posted", date: { $lte: endDate } } },
      { $unwind: "$lines" },
      { $match: { "lines.accountCode": ledgerAccountId } },
      { $group: { _id: null, totalDebits: { $sum: { $toDouble: { $ifNull: ["$lines.debit", 0] } } }, totalCredits: { $sum: { $toDouble: { $ifNull: ["$lines.credit", 0] } } } } }
    ]).allowDiskUse(true);

    const bookDebits = agg && agg[0] ? agg[0].totalDebits || 0 : 0;
    const bookCredits = agg && agg[0] ? agg[0].totalCredits || 0 : 0;
    const openingBalance = coerceDecimal128(account.openingBalance);
    const bookBalance = openingBalance + bookDebits - bookCredits;

    // Get statement lines in this reconciliation period
    const statementLines = await BankStatementLine.find({
      bankAccount: account._id,
      transactionDate: { $lte: endDate },
      $or: [{ reconciliationId: reconciliation._id }, { reconciliationId: null }],
    }).lean();

    const lastStatementBalance = statementLines.length > 0
      ? coerceDecimal128(statementLines[statementLines.length - 1].balance)
      : 0;

    // Count unreconciled items
    const unreconciledStatement = statementLines.filter(s => !s.isReconciled && s.status !== "ignored");
    const unreconciledStatementAmount = unreconciledStatement.reduce((sum, s) => sum + Math.abs(coerceDecimal128(s.creditAmount) || coerceDecimal128(s.debitAmount)), 0);

    // Get unreconciled journal lines
    const journalEntries = await JournalEntry.find({
      company: companyId,
      status: "posted",
      date: { $lte: endDate },
      lines: { $elemMatch: { accountCode: ledgerAccountId } },
      isLocked: { $ne: true },
      reconciliationStatus: { $ne: "reconciled" },
    }).lean();

    const unmatchedJournalLines = [];
    for (const entry of journalEntries) {
      for (const line of entry.lines) {
        if (line.accountCode !== ledgerAccountId) continue;
        const matches = await BankReconciliationMatch.find({ journalEntryLineId: line._id }).lean();
        if (matches.length === 0) unmatchedJournalLines.push({ entryId: entry._id, lineId: line._id, amount: Math.abs(coerceDecimal128(line.debit) || coerceDecimal128(line.credit)) });
      }
    }

    // Calculate adjusted balances
    const unreconciledJournalDR = unmatchedJournalLines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const unreconciledJournalCR = unmatchedJournalLines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const adjustedBankBalance = lastStatementBalance + unreconciledJournalDR - unreconciledJournalCR;
    const difference = adjustedBankBalance - bookBalance;

    // Validation: must have difference = 0 or force flag with acknowledgment
    if (Math.abs(difference) > 0.01 && !force) {
      return res.status(400).json({
        success: false,
        message: `Reconciliation cannot be completed. Difference is ${roundMoney(difference)}. All items must be matched or explained before completion.`,
        data: {
          difference: roundMoney(difference),
          adjustedBankBalance: roundMoney(adjustedBankBalance),
          bookBalance: roundMoney(bookBalance),
          unreconciledStatementCount: unreconciledStatement.length,
          unreconciledStatementAmount: roundMoney(unreconciledStatementAmount),
          unmatchedJournalCount: unmatchedJournalLines.length,
        },
      });
    }

    // Lock all matched journal entries and mark as reconciled
    const matchedLines = await BankReconciliationMatch.find({ bankAccount: account._id, company: companyId }).lean();
    const lockedEntryIds = new Set();
    for (const match of matchedLines) {
      if (!lockedEntryIds.has(match.journalEntry.toString())) {
        await JournalEntry.updateOne(
          { _id: match.journalEntry },
          {
            reconciliationStatus: "reconciled",
            reconciledAt: new Date(),
            reconciledInReconciliationId: reconciliation._id,
            reconciledBy: req.user._id,
            isLocked: true,
          }
        );
        lockedEntryIds.add(match.journalEntry.toString());
      }
    }

    // Update reconciliation record
    reconciliation.status = "completed";
    reconciliation.completedAt = new Date();
    reconciliation.completedBy = req.user._id;
    reconciliation.bookClosingBalance = mongoose.Types.Decimal128.fromString(bookBalance.toFixed(2));
    reconciliation.difference = mongoose.Types.Decimal128.fromString(difference.toFixed(2));
    reconciliation.reportSnapshot = {
      beginningBookBalance: mongoose.Types.Decimal128.fromString(openingBalance.toFixed(2)),
      totalDepositsPerBooks: mongoose.Types.Decimal128.fromString(bookDebits.toFixed(2)),
      totalChecksPerBooks: mongoose.Types.Decimal128.fromString(bookCredits.toFixed(2)),
      endingBookBalance: mongoose.Types.Decimal128.fromString(bookBalance.toFixed(2)),
      outstandingDeposits: mongoose.Types.Decimal128.fromString(unreconciledJournalDR.toFixed(2)),
      outstandingChecks: mongoose.Types.Decimal128.fromString(unreconciledJournalCR.toFixed(2)),
      adjustingEntriesTotal: mongoose.Types.Decimal128.fromString("0"),
      statementLinesCount: statementLines.length,
      matchedCount: statementLines.filter(s => s.isReconciled).length,
      unmatchedStatementCount: unreconciledStatement.length,
      unmatchedJournalCount: unmatchedJournalLines.length,
    };
    if (notes) reconciliation.notes = notes;
    await reconciliation.save();

    // Update bank account last reconciled info
    account.lastReconciledAt = new Date();
    account.lastReconciledBalance = mongoose.Types.Decimal128.fromString(lastStatementBalance.toFixed(2));
    await account.save();

    res.json({
      success: true,
      message: "Reconciliation completed successfully",
      data: {
        reconciliationId: reconciliation._id,
        completedAt: reconciliation.completedAt,
        lockedEntriesCount: lockedEntryIds.size,
        finalDifference: roundMoney(difference),
        bookBalance: roundMoney(bookBalance),
        statementBalance: roundMoney(lastStatementBalance),
      },
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// 9. CANCEL RECONCILIATION
// =====================================================
exports.cancelReconciliation = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { reconciliationId } = req.body;

    const account = await BankAccount.findOne({ _id: req.params.id, company: companyId });
    if (!account) return res.status(404).json({ success: false, message: "Bank account not found" });

    const reconciliation = await BankReconciliation.findOne({
      _id: reconciliationId || { $exists: true },
      bankAccount: account._id,
      company: companyId,
      status: { $in: ["draft", "in_progress"] },
    }).sort({ startedAt: -1 });

    if (!reconciliation) return res.status(404).json({ success: false, message: "No active reconciliation found" });

    // Remove matches created in this reconciliation
    await BankReconciliationMatch.deleteMany({ bankAccount: account._id, company: companyId, matchedAt: { $gte: reconciliation.startedAt } });

    // Reset statement lines status
    await BankStatementLine.updateMany(
      { reconciliationId: reconciliation._id },
      { status: "unmatched", isReconciled: false, matchedAmount: null, reconciliationId: null }
    );

    reconciliation.status = "cancelled";
    await reconciliation.save();

    res.json({ success: true, message: "Reconciliation cancelled", data: { reconciliationId: reconciliation._id } });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// 10. IMPORT STATEMENT (CSV with proper date parsing)
// =====================================================
exports.importStatement = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { reconciliationId, dateFormat, skipFirstRow = true } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ success: false, message: "CSV file is required" });

    const account = await BankAccount.findOne({ _id: req.params.id, company: companyId });
    if (!account) return res.status(404).json({ success: false, message: "Bank account not found" });

    let reconciliation = null;
    if (reconciliationId) {
      reconciliation = await BankReconciliation.findOne({ _id: reconciliationId, bankAccount: account._id, company: companyId });
    }

    const csv = require("csv-parse/sync");
    const buffer = file.buffer || require("fs").readFileSync(file.path);
    const records = csv.parse(buffer, { columns: true, skip_empty_lines: true, trim: true });

    const mappings = {
      date: req.body.dateColumn || "Date",
      description: req.body.descriptionColumn || "Description",
      debit: req.body.debitColumn || "Debit",
      credit: req.body.creditColumn || "Credit",
      balance: req.body.balanceColumn || "Balance",
      reference: req.body.referenceColumn || "Reference",
    };

    const parsed = [];
    let runningBalance = 0;
    const openingBalance = coerceDecimal128(account.openingBalance);

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      if (!row[mappings.date]) continue;

      const parsedDate = parseDate(row[mappings.date], dateFormat || "auto");
      if (!parsedDate) continue;

      const debitVal = parseFloat(row[mappings.debit] || 0) || 0;
      const creditVal = parseFloat(row[mappings.credit] || 0) || 0;
      const balanceVal = row[mappings.balance] ? parseFloat(row[mappings.balance]) : null;

      if (balanceVal !== null && i === 0) runningBalance = balanceVal - creditVal + debitVal;
      else runningBalance += creditVal - debitVal;

      parsed.push({
        bankAccount: account._id,
        reconciliationId: reconciliation ? reconciliation._id : null,
        company: companyId,
        transactionDate: parsedDate,
        description: row[mappings.description] || "",
        debitAmount: mongoose.Types.Decimal128.fromString(debitVal.toFixed(2)),
        creditAmount: mongoose.Types.Decimal128.fromString(creditVal.toFixed(2)),
        balance: balanceVal !== null ? mongoose.Types.Decimal128.fromString(balanceVal.toFixed(2)) : mongoose.Types.Decimal128.fromString(runningBalance.toFixed(2)),
        reference: row[mappings.reference] || null,
        status: "unmatched",
        isReconciled: false,
        importedAt: new Date(),
      });
    }

    const inserted = await BankStatementLine.insertMany(parsed);

    // If reconciliation exists, update its closing balances based on imported data
    if (reconciliation && inserted.length > 0) {
      // Get the last imported line's balance
      const lastLine = inserted[inserted.length - 1];
      const lastBalance = coerceDecimal128(lastLine.balance);

      // Update reconciliation with actual statement closing balance
      reconciliation.statementClosingBalance = mongoose.Types.Decimal128.fromString(lastBalance.toFixed(2));

      // Recalculate book closing balance based on current ledger
      const ledgerAccountId = account.ledgerAccountId || "1100";
      const endDate = reconciliation.statementDateEnd;

      const journalEntries = await JournalEntry.find({
        company: companyId,
        status: "posted",
        date: { $lte: endDate },
        lines: { $elemMatch: { accountCode: ledgerAccountId } },
      }).lean();

      let bookDebits = 0, bookCredits = 0;
      for (const entry of journalEntries) {
        for (const line of entry.lines) {
          if (line.accountCode !== ledgerAccountId) continue;
          bookDebits += coerceDecimal128(line.debit);
          bookCredits += coerceDecimal128(line.credit);
        }
      }

      const openingBalance = coerceDecimal128(account.openingBalance);
      const bookBalance = openingBalance + bookDebits - bookCredits;
      reconciliation.bookClosingBalance = mongoose.Types.Decimal128.fromString(bookBalance.toFixed(2));

      await reconciliation.save();
    }

    res.status(201).json({
      success: true,
      message: `${inserted.length} statement lines imported`,
      data: {
        count: inserted.length,
        reconciliationId: reconciliation ? reconciliation._id : null,
        firstDate: inserted.length > 0 ? inserted[0].transactionDate : null,
        lastDate: inserted.length > 0 ? inserted[inserted.length - 1].transactionDate : null,
        updatedBalances: reconciliation ? {
          statementClosingBalance: roundMoney(coerceDecimal128(reconciliation.statementClosingBalance)),
          bookClosingBalance: roundMoney(coerceDecimal128(reconciliation.bookClosingBalance)),
        } : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// 11. LIST RECONCILIATIONS (history)
// =====================================================
exports.listReconciliations = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { status, limit = 20, page = 1 } = req.query;

    const account = await BankAccount.findOne({ _id: req.params.id, company: companyId });
    if (!account) return res.status(404).json({ success: false, message: "Bank account not found" });

    const query = { bankAccount: account._id, company: companyId };
    if (status) query.status = status;

    const reconciliations = await BankReconciliation.find(query)
      .sort({ startedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await BankReconciliation.countDocuments(query);

    res.json({
      success: true,
      data: reconciliations,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// 12. GET RECONCILIATION REPORT
// =====================================================
exports.getReconciliationReport = async (req, res, next) => {
  try {
    const companyId = req.user.company._id;
    const { reconciliationId } = req.query;

    const account = await BankAccount.findOne({ _id: req.params.id, company: companyId });
    if (!account) return res.status(404).json({ success: false, message: "Bank account not found" });

    let reconciliation;
    if (reconciliationId) {
      reconciliation = await BankReconciliation.findOne({ _id: reconciliationId, bankAccount: account._id, company: companyId });
    } else {
      reconciliation = await BankReconciliation.findOne({ bankAccount: account._id, company: companyId }).sort({ completedAt: -1 });
    }

    if (!reconciliation) return res.status(404).json({ success: false, message: "No reconciliation found" });

    // Get matched items detail
    const matches = await BankReconciliationMatch.find({ bankAccount: account._id, company: companyId }).populate("bankStatementLine journalEntry").lean();

    const matchedItems = matches.map(m => ({
      matchId: m._id,
      statementDate: m.bankStatementLine?.transactionDate,
      statementDescription: m.bankStatementLine?.description,
      statementAmount: coerceDecimal128(m.bankStatementLine?.creditAmount) || coerceDecimal128(m.bankStatementLine?.debitAmount),
      journalEntryNumber: m.journalEntry?.entryNumber,
      journalDescription: m.journalEntry?.description,
      matchedAmount: coerceDecimal128(m.matchedAmount),
      matchedAt: m.matchedAt,
    }));

    res.json({
      success: true,
      data: {
        reconciliationId: reconciliation._id,
        status: reconciliation.status,
        period: { start: reconciliation.statementDateStart, end: reconciliation.statementDateEnd },
        statementClosingBalance: coerceDecimal128(reconciliation.statementClosingBalance),
        bookClosingBalance: coerceDecimal128(reconciliation.bookClosingBalance),
        difference: coerceDecimal128(reconciliation.difference),
        completedAt: reconciliation.completedAt,
        reportSnapshot: reconciliation.reportSnapshot,
        matchedItems,
        notes: reconciliation.notes,
      },
    });
  } catch (error) {
    next(error);
  }
};
