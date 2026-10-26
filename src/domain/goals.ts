import type { EntryStatus, Goal, Transaction } from '../types';
import { newId } from '../lib/format';

export const isGoalMovement = (kind?: Transaction['kind']): boolean => kind === 'goalContribution' || kind === 'goalWithdrawal';

/** Formulário que edita o lançamento. Aporte/resgate abre o de meta, para não virar despesa/receita sem querer (B2b). */
export function editFormFor(entry: Pick<Transaction, 'kind'>): 'deposit' | 'entry' {
  return isGoalMovement(entry.kind) ? 'deposit' : 'entry';
}

/**
 * Conta da meta que o movimento credita (aporte) ou debita (resgate). Movimento já gravado na mesma meta e no mesmo
 * sentido mantém a que tinha, para editar não mexer em saldo antigo; os demais usam a conta atual da meta (B2a).
 */
export function goalAccountFor(goal: Goal | undefined, withdrawal: boolean, entry?: Transaction): string | undefined {
  const kind = withdrawal ? 'goalWithdrawal' : 'goalContribution';
  if (entry && goal && entry.relatedId === goal.id && entry.kind === kind) return entry.goalAccountId;
  return goal?.accountId;
}

/** Aporte ou resgate novo, ou `entry` editado. `accountId` é a conta de origem do aporte ou a que recebe o resgate. */
export function buildGoalMovement(input: { goal: Goal; withdrawal: boolean; amountCents: number; date: string; accountId?: string; notes?: string; entry?: Transaction }): Transaction {
  const { goal, withdrawal, amountCents, date, accountId, notes, entry } = input;
  if (amountCents <= 0) throw new Error('Escolha uma meta e informe um valor.');
  const kind = withdrawal ? 'goalWithdrawal' : 'goalContribution';
  const goalAccountId = goalAccountFor(goal, withdrawal, entry);
  if (goalAccountId && !accountId) throw new Error(withdrawal ? 'Escolha a conta que recebe o resgate.' : 'Escolha a conta de origem do aporte.');
  if (goalAccountId && accountId === goalAccountId) throw new Error('Escolha uma conta diferente da conta da meta.');
  const sameMovement = entry?.relatedId === goal.id && entry.kind === kind;
  const status: EntryStatus = entry && entry.status !== 'paid' ? 'pending' : 'paid';
  return {
    ...entry, id: entry?.id ?? newId(), kind, amountCents, date,
    description: sameMovement ? entry.description : `${withdrawal ? 'Resgate' : 'Aporte'} · ${goal.name}`,
    accountId: accountId || undefined, goalAccountId, tags: entry?.tags ?? ['meta'], notes: notes || undefined,
    status, paidAt: status === 'paid' ? date : undefined, relatedId: goal.id, createdAt: entry?.createdAt ?? new Date().toISOString()
  };
}
