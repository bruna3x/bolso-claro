import { db } from './index';
import { planObligations } from '../domain/recurring';
import { accountBalances, buildInvoices, debtLedgerState, debtLedgerStateIncludingDeleted, netWorthCents } from '../domain/finance';
import { addMonthsKey, monthKey, newId, todayISO } from '../lib/format';
import type { Account, Goal, Receivable, Transaction, TrashItem } from '../types';

export async function migrateLegacyLedgers(): Promise<void> {
  await db.transaction('rw', db.goalMovements, db.transactions, db.debts, async () => {
    const [movements, transactions, debts] = await Promise.all([db.goalMovements.toArray(), db.transactions.toArray(), db.debts.toArray()]);
    const usedTransactions = new Set<string>();
    const missing: Transaction[] = [];
    for (const movement of movements) {
      const kind = movement.kind === 'deposit' ? 'goalContribution' : 'goalWithdrawal';
      const linked = transactions.filter(tx => tx.kind === kind && tx.relatedId === movement.goalId && !usedTransactions.has(tx.id));
      const match = linked.find(tx => tx.amountCents === movement.amountCents && tx.date === movement.date && tx.accountId === movement.accountId)
        ?? linked.find(tx => tx.amountCents === movement.amountCents)
        ?? linked.find(tx => tx.date === movement.date && tx.accountId === movement.accountId)
        ?? linked[0];
      if (match) { usedTransactions.add(match.id); continue; }
      missing.push({ id: newId(), kind, amountCents: movement.amountCents, date: movement.date, description: `${kind === 'goalContribution' ? 'Aporte' : 'Resgate'} · Meta`, accountId: movement.accountId, tags: ['meta'], status: 'paid', paidAt: movement.date, relatedId: movement.goalId, createdAt: new Date().toISOString() });
    }
    if (missing.length) await db.transactions.bulkAdd(missing);
    for (const debt of debts) {
      if (debt.openingBalanceCents !== undefined) continue;
      const replayed = debtLedgerStateIncludingDeleted({ ...debt, openingBalanceCents: debt.originalCents, openingPaidInstallments: 0, openingInterestPaidCents: 0 }, transactions);
      const historicalPayments = transactions.filter(tx => tx.status === 'paid' && tx.kind === 'expense' && (tx.relatedId === debt.id || tx.recurrenceId === `debt:${debt.id}`));
      await db.debts.update(debt.id, {
        openingBalanceCents: Math.max(0, debt.balanceCents + debt.originalCents - replayed.balanceCents),
        openingPaidInstallments: Math.max(0, debt.paidInstallments - historicalPayments.length),
        openingInterestPaidCents: Math.max(0, debt.interestPaidCents - replayed.interestPaidCents)
      });
    }
    if (movements.length) await db.goalMovements.clear();
  });
}

export async function generateCurrentObligations(): Promise<void> {
  await db.transaction('rw', [db.transactions, db.recurring, db.debts, db.goals, db.accounts], async () => {
    const [recurring, debts, goals, accounts, transactions] = await Promise.all([db.recurring.toArray(), db.debts.toArray(), db.goals.toArray(), db.accounts.toArray(), db.transactions.toArray()]);
    const plan = planObligations({ recurring, debts, goals, accounts, transactions });
    if (plan.add.length) await db.transactions.bulkAdd(plan.add);
    for (const [id, generatedThrough] of Object.entries(plan.recurringThrough)) await db.recurring.update(id, { generatedThrough });
    for (const [id, generatedThrough] of Object.entries(plan.debtsThrough)) await db.debts.update(id, { generatedThrough });
    for (const [id, generatedThrough] of Object.entries(plan.goalsThrough)) await db.goals.update(id, { generatedThrough });
  });
  await createPreviousMonthSnapshot();
}

async function createPreviousMonthSnapshot(): Promise<void> {
  const month = addMonthsKey(monthKey(), -1);
  if (await db.snapshots.where('month').equals(month).first()) return;
  const start = `${month}-01`;
  const [accounts, cards, transactions, debts] = await Promise.all([db.accounts.toArray(), db.cards.toArray(), db.transactions.toArray(), db.debts.toArray()]);
  const through = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).toLocaleDateString('en-CA');
  const historic = transactions.filter(t => !t.deletedAt && t.date <= through);
  const balances = accountBalances(accounts, historic);
  const invoices = buildInvoices(cards, historic);
  const totalAccounts = accounts.filter(a => a.includeInTotal && !a.archived).reduce((s, a) => s + (balances[a.id] ?? 0), 0);
  const cardDebt = invoices.reduce((s, i) => s + i.remainingCents, 0);
  const debtStates = debts.map(d => debtLedgerState(d, historic));
  const debt = debtStates.filter(d => d.active).reduce((s, d) => s + d.balanceCents, 0);
  await db.snapshots.add({ id: newId(), month, netWorthCents: netWorthCents(accounts, balances, invoices, debtStates), accountTotalCents: totalAccounts, cardDebtCents: cardDebt, debtCents: debt, createdAt: new Date().toISOString() });
  void start;
}

export async function settleReceivable(receivable: Receivable, amountCents: number, accountId: string): Promise<void> {
  const value = Math.max(0, Math.min(amountCents, receivable.amountCents - receivable.receivedCents));
  if (!value) return;
  await db.transaction('rw', db.receivables, db.transactions, async () => {
    const current = await db.receivables.get(receivable.id); if (!current) return;
    const receivedCents = Math.min(current.amountCents, current.receivedCents + value);
    await db.receivables.put({ ...current, receivedCents, status: receivedCents >= current.amountCents ? 'received' : 'partial', receivedAt: receivedCents >= current.amountCents ? todayISO() : current.receivedAt });
    await db.transactions.add({ id: newId(), kind: 'reimbursement', amountCents: value, date: todayISO(), description: `Recebimento · ${current.person}`, accountId, tags: [], status: 'paid', paidAt: todayISO(), relatedId: current.id, createdAt: new Date().toISOString() });
  });
}

export async function moveTransactionToTrash(transaction: Transaction): Promise<void> {
  const deletedAt = new Date().toISOString();
  await db.transaction('rw', db.transactions, db.trash, async () => {
    await db.transactions.update(transaction.id, { deletedAt });
    await db.trash.add({ id: newId(), entity: 'transaction', entityId: transaction.id, deletedAt, data: transaction });
  });
}
export async function moveGoalToTrash(goal: Goal): Promise<void> {
  const deletedAt = new Date().toISOString();
  await db.transaction('rw', db.goals, db.transactions, db.trash, async () => {
    const current = await db.goals.get(goal.id); if (!current) return;
    await db.goals.delete(goal.id);
    await db.trash.add({ id: newId(), entity: 'goal', entityId: goal.id, deletedAt, data: current });
    const linked = (await db.transactions.toArray()).filter(tx => tx.relatedId === goal.id && (tx.kind === 'goalContribution' || tx.kind === 'goalWithdrawal'));
    const trashed = await db.trash.where('entity').equals('transaction').toArray();
    for (const tx of linked) {
      const existing = trashed.find(item => item.entityId === tx.id);
      if (existing) await db.trash.update(existing.id, { deletedAt, data: { ...tx, deletedAt: undefined } });
      else await db.trash.add({ id: newId(), entity: 'transaction', entityId: tx.id, deletedAt, data: { ...tx, deletedAt: undefined } });
      await db.transactions.update(tx.id, { deletedAt });
    }
  });
}

async function restoreGoalBundle(goalId: string, goalData: Goal, goalTrashId?: string): Promise<void> {
  await db.goals.put(goalData);
  const candidates = await db.trash.where('entity').equals('transaction').toArray();
  for (const item of candidates) {
    const tx = item.data as Transaction;
    if (tx.relatedId !== goalId || (tx.kind !== 'goalContribution' && tx.kind !== 'goalWithdrawal')) continue;
    await db.transactions.update(item.entityId, { deletedAt: undefined });
    await db.trash.delete(item.id);
  }
  if (goalTrashId) await db.trash.delete(goalTrashId);
}

export async function restoreTrashItem(item: TrashItem): Promise<void> {
  await db.transaction('rw', db.transactions, db.trash, db.goals, async () => {
    if (item.entity === 'goal') {
      await restoreGoalBundle(item.entityId, item.data as Goal, item.id);
      return;
    }
    if (item.entity === 'transaction') {
      const transaction = item.data as Transaction;
      const goal = transaction.relatedId ? await db.goals.get(transaction.relatedId) : undefined;
      if (transaction.relatedId && !goal && (transaction.kind === 'goalContribution' || transaction.kind === 'goalWithdrawal')) {
        const goalItem = (await db.trash.where('entity').equals('goal').toArray()).find(candidate => candidate.entityId === transaction.relatedId);
        if (goalItem) { await restoreGoalBundle(goalItem.entityId, goalItem.data as Goal, goalItem.id); return; }
      }
      await db.transactions.update(item.entityId, { deletedAt: undefined });
    }
    await db.trash.delete(item.id);
  });
}
export async function purgeExpiredTrash(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const old = await db.trash.where('deletedAt').below(cutoff).toArray();
  await db.transaction('rw', db.transactions, db.trash, async () => {
    for (const item of old) { if (item.entity === 'transaction') await db.transactions.delete(item.entityId); await db.trash.delete(item.id); }
  });
}

export function accountBalance(account: Account, entries: Transaction[]): number { return accountBalances([account], entries)[account.id] ?? account.initialBalanceCents; }
