import type { Account, CreditCard, Debt, Invoice, Transaction } from '../types';
import { safeDay, todayISO } from '../lib/format';

export function invoiceMonthFor(date: string, closingDay: number): string {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  const d = new Date(year, month - 1 + (day > closingDay ? 1 : 0), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function invoiceDueDate(month: string, dueDay: number): string {
  const [year, m] = month.split('-').map(Number);
  const day = safeDay(dueDay, year, m - 1);
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function buildInvoices(cards: CreditCard[], transactions: Transaction[], selectedMonth?: string): Invoice[] {
  const groups = new Map<string, { card: CreditCard; month: string; purchases: Transaction[]; paid: number }>();
  for (const tx of transactions) {
    if (tx.deletedAt || tx.kind === 'cardPayment' || !tx.cardId) continue;
    const card = cards.find(c => c.id === tx.cardId); if (!card) continue;
    const month = tx.invoiceMonth || invoiceMonthFor(tx.date, card.closingDay);
    if (selectedMonth && month !== selectedMonth) continue;
    const key = `${card.id}:${month}`;
    const group = groups.get(key) ?? { card, month, purchases: [], paid: 0 };
    if (tx.kind === 'expense') group.purchases.push(tx);
    groups.set(key, group);
  }
  for (const tx of transactions) if (!tx.deletedAt && tx.status === 'paid' && tx.kind === 'cardPayment' && tx.cardId && (tx.paidAt?.slice(0, 10) ?? tx.date) <= todayISO()) {
    const card = cards.find(c => c.id === tx.cardId); if (!card) continue;
    const month = tx.invoiceMonth || invoiceMonthFor(tx.date, card.closingDay);
    if (selectedMonth && month !== selectedMonth) continue;
    const key = `${card.id}:${month}`;
    const group = groups.get(key) ?? { card, month, purchases: [], paid: 0 };
    group.paid += tx.amountCents; groups.set(key, group);
  }
  return [...groups.values()].map(({ card, month, purchases, paid }) => {
    const totalCents = purchases.reduce((sum, p) => sum + p.amountCents, 0);
    const remainingCents = Math.max(0, totalCents - paid);
    const today = todayISO(); const afterClosing = month < today.slice(0, 7) || (month === today.slice(0, 7) && Number(today.slice(8, 10)) > card.closingDay); const status: Invoice['status'] = remainingCents === 0 ? 'paid' : paid > 0 ? 'partial' : afterClosing ? 'closed' : 'open';
    return { id: `${card.id}:${month}`, cardId: card.id, month, purchases, totalCents, paidCents: paid, remainingCents, status, dueDate: invoiceDueDate(month, card.dueDay) };
  }).sort((a, b) => a.month.localeCompare(b.month));
}

export function goalBalanceCents(goalId: string, transactions: Transaction[]): number {
  const movement = transactions.filter(tx => !tx.deletedAt && tx.status === 'paid' && tx.relatedId === goalId && (tx.kind === 'goalContribution' || tx.kind === 'goalWithdrawal'));
  return Math.max(0, movement.reduce((total, tx) => total + (tx.kind === 'goalContribution' ? tx.amountCents : -tx.amountCents), 0));
}

function replayDebtLedger(debt: Debt, transactions: Transaction[], includeDeleted: boolean): Debt {
  let balance = Math.max(0, debt.openingBalanceCents ?? debt.originalCents);
  let paidInstallments = Math.max(0, debt.openingPaidInstallments ?? 0);
  let interestPaidCents = Math.max(0, debt.openingInterestPaidCents ?? 0);
  const payments = transactions.filter(tx => (includeDeleted || !tx.deletedAt) && tx.status === 'paid' && tx.kind === 'expense' && (tx.relatedId === debt.id || tx.recurrenceId === `debt:${debt.id}`))
    .sort((a, b) => (a.paidAt ?? a.date).localeCompare(b.paidAt ?? b.date) || a.createdAt.localeCompare(b.createdAt));
  for (const payment of payments) {
    if (balance <= 0) break;
    const interestDue = Math.round(balance * debt.monthlyRateBps / 10000);
    const paid = Math.min(balance + interestDue, Math.max(0, payment.amountCents));
    const interest = Math.min(paid, interestDue);
    balance = Math.max(0, balance - Math.max(0, paid - interest));
    interestPaidCents += interest;
    paidInstallments += 1;
  }
  return { ...debt, balanceCents: balance, paidInstallments, interestPaidCents, active: balance > 0 };
}

export function debtLedgerState(debt: Debt, transactions: Transaction[]): Debt {
  return replayDebtLedger(debt, transactions, false);
}

export function debtLedgerStateIncludingDeleted(debt: Debt, transactions: Transaction[]): Debt {
  return replayDebtLedger(debt, transactions, true);
}

export function debtPaymentAmountCents(debt: Debt, scheduledCents: number): number {
  const interestDue = Math.round(debt.balanceCents * debt.monthlyRateBps / 10000);
  return Math.min(Math.max(0, scheduledCents), debt.balanceCents + interestDue);
}

export function accountBalances(accounts: Account[], transactions: Transaction[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(accounts.map(a => [a.id, a.initialBalanceCents]));
  for (const tx of transactions) {
    if (tx.deletedAt || tx.status !== 'paid') continue;
    const effectiveDate = tx.paidAt?.slice(0, 10) ?? tx.date;
    if (effectiveDate > todayISO()) continue;
    const amount = tx.amountCents;
    if ((tx.kind === 'income' || tx.kind === 'reimbursement') && tx.accountId) out[tx.accountId] = (out[tx.accountId] ?? 0) + amount;
    if ((tx.kind === 'expense' || tx.kind === 'goalContribution') && tx.accountId && !tx.cardId) out[tx.accountId] = (out[tx.accountId] ?? 0) - amount;
    if (tx.kind === 'cardPayment' && tx.accountId) out[tx.accountId] = (out[tx.accountId] ?? 0) - amount;
    if (tx.kind === 'transfer') {
      if (tx.accountId) out[tx.accountId] = (out[tx.accountId] ?? 0) - amount;
      if (tx.destinationAccountId) out[tx.destinationAccountId] = (out[tx.destinationAccountId] ?? 0) + amount;
    }
    if (tx.kind === 'adjustment' && tx.accountId) out[tx.accountId] = (out[tx.accountId] ?? 0) + amount;
    if (tx.kind === 'goalWithdrawal' && tx.accountId) out[tx.accountId] = (out[tx.accountId] ?? 0) + amount;
  }
  return out;
}
export function monthTotals(transactions: Transaction[], month: string, receivables: { originalTransactionId?: string; receivedCents: number }[] = []): { income: number; expenses: number; pending: number; saved: number } {
  const selected = transactions.filter(tx => !tx.deletedAt && tx.date.slice(0, 7) === month);
  const income = selected.filter(tx => tx.kind === 'income').reduce((s, tx) => s + tx.amountCents, 0);
  const gross = selected.filter(tx => tx.kind === 'expense').reduce((s, tx) => s + tx.amountCents, 0);
  const reimbursementOffset = receivables.reduce((sum, item) => {
    const original = transactions.find(tx => tx.id === item.originalTransactionId);
    return original?.kind === 'expense' && original.date.startsWith(month) ? sum + item.receivedCents : sum;
  }, 0);
  const expenses = Math.max(0, gross - reimbursementOffset);
  const pending = selected.filter(tx => ['pending', 'overdue'].includes(tx.status) && ['expense', 'goalContribution'].includes(tx.kind) && !tx.cardId).reduce((s, tx) => s + tx.amountCents, 0);
  const saved = selected.filter(tx => tx.kind === 'goalContribution' && tx.status === 'paid').reduce((s, tx) => s + tx.amountCents, 0);
  return { income, expenses, pending, saved };
}
export function expensesByCategory(transactions: Transaction[], month: string, categories: { id: string; name: string; color: string }[], receivables: { originalTransactionId?: string; amountCents: number; receivedCents: number; status: string }[]): { name: string; id: string; amount: number; color: string }[] {
  const totals = new Map<string, number>();
  for (const tx of transactions) if (!tx.deletedAt && tx.kind === 'expense' && tx.date.startsWith(month)) totals.set(tx.categoryId ?? 'other', (totals.get(tx.categoryId ?? 'other') ?? 0) + tx.amountCents);
  for (const r of receivables) if (r.originalTransactionId && r.receivedCents > 0) {
    const tx = transactions.find(item => item.id === r.originalTransactionId);
    if (tx?.date.startsWith(month)) totals.set(tx.categoryId ?? 'other', Math.max(0, (totals.get(tx.categoryId ?? 'other') ?? 0) - r.receivedCents));
  }
  return [...totals.entries()].map(([id, amount]) => ({ id, name: categories.find(c => c.id === id)?.name ?? 'Outros', amount, color: categories.find(c => c.id === id)?.color ?? '#88918C' })).filter(x => x.amount > 0).sort((a, b) => b.amount - a.amount);
}
export function netWorthCents(accounts: Account[], balances: Record<string, number>, invoices: Invoice[], debts: Debt[]): number {
  const assets = accounts.filter(a => a.includeInTotal && !a.archived).reduce((sum, a) => sum + (balances[a.id] ?? 0), 0);
  const cardDebt = invoices.reduce((sum, inv) => sum + inv.remainingCents, 0);
  const debt = debts.filter(d => d.active).reduce((sum, d) => sum + d.balanceCents, 0);
  return assets - cardDebt - debt;
}
export function currentBudgetUse(transactions: Transaction[], month: string, categoryId: string, receivables: { originalTransactionId?: string; receivedCents: number }[] = []): number {
  const gross = transactions.filter(t => !t.deletedAt && t.kind === 'expense' && t.categoryId === categoryId && t.date.startsWith(month)).reduce((sum, t) => sum + t.amountCents, 0);
  const offset = receivables.reduce((sum, r) => { const original=transactions.find(t=>t.id===r.originalTransactionId); return original?.categoryId===categoryId&&original.date.startsWith(month)?sum+r.receivedCents:sum; },0);
  return Math.max(0,gross-offset);
}
