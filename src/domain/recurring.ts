import type { Account, Debt, Goal, RecurringItem, Transaction } from '../types';
import { newId, safeDay, todayISO } from '../lib/format';
import { debtLedgerState } from './finance';

function stepMonths(frequency: RecurringItem['frequency']): number { return ({ weekly: 0, fortnightly: 0, monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 } as const)[frequency]; }
export function occurrencesThrough(item: RecurringItem, through = todayISO()): string[] {
  const start = new Date(`${item.startDate}T12:00:00`); const end = item.endDate ? new Date(`${item.endDate}T12:00:00`) : undefined;
  const limit = new Date(`${through}T12:00:00`); const dates: string[] = [];
  for (let i = 0; i < 240; i++) {
    let date: Date;
    if (item.frequency === 'weekly' || item.frequency === 'fortnightly') date = new Date(start.getTime() + i * (item.frequency === 'weekly' ? 7 : 14) * 86_400_000);
    else { const base = new Date(start.getFullYear(), start.getMonth() + i * stepMonths(item.frequency), 1); date = new Date(base.getFullYear(), base.getMonth(), safeDay(item.dueDay || start.getDate(), base.getFullYear(), base.getMonth()), 12); }
    if (date < start) continue; if (date > limit || (end && date > end)) break;
    dates.push(date.toLocaleDateString('en-CA'));
  }
  return dates;
}
export interface ObligationPlan {
  add: Transaction[];
  /** Novo `generatedThrough` de cada recorrente, dívida e meta cujo marcador avançou. */
  recurringThrough: Record<string, string>; debtsThrough: Record<string, string>; goalsThrough: Record<string, string>;
}

/** Última data já gerada para a série, contando excluídos. Só serve para dados sem marcador (anteriores à F1). */
function lastKnownDate(recurrenceId: string, transactions: Transaction[]): string | undefined {
  let last: string | undefined;
  for (const tx of transactions) if (tx.recurrenceId === recurrenceId && (!last || tx.date > last)) last = tx.date;
  return last;
}

/**
 * Ocorrências de recorrentes, parcelas de dívida e aportes automáticos a criar até o fim do mês de `today`.
 * Cada série só gera datas depois do seu `generatedThrough`, que avança até o fim do mês: excluir uma ocorrência,
 * mesmo depois do expurgo da lixeira, não a recria (B3). Tudo nasce `pending`; "atrasado" é calculado (B5).
 */
export function planObligations(input: { recurring: RecurringItem[]; debts: Debt[]; goals: Goal[]; accounts: Account[]; transactions: Transaction[]; today?: string }): ObligationPlan {
  const { recurring, debts, goals, accounts, transactions } = input;
  const today = input.today ?? todayISO();
  const year = Number(today.slice(0, 4)); const monthIndex = Number(today.slice(5, 7)) - 1; const month = today.slice(0, 7);
  const monthEnd = `${month}-${String(new Date(year, monthIndex + 1, 0).getDate()).padStart(2, '0')}`;
  const createdAt = new Date().toISOString();
  const live = new Set(transactions.filter(t => !t.deletedAt && t.recurrenceId).map(t => `${t.recurrenceId}:${t.date}`));
  const plan: ObligationPlan = { add: [], recurringThrough: {}, debtsThrough: {}, goalsThrough: {} };
  const behind = (marker?: string) => !marker || marker < monthEnd;

  for (const item of recurring.filter(i => i.active)) {
    const from = item.generatedThrough ?? lastKnownDate(item.id, transactions);
    for (const date of occurrencesThrough(item, monthEnd)) {
      if ((from && date <= from) || live.has(`${item.id}:${date}`)) continue;
      plan.add.push({ id: newId(), kind: item.kind, amountCents: item.amountCents, date, dueDate: date, categoryId: item.categoryId,
        description: item.variable ? `${item.name} · confirmar valor` : item.name, accountId: item.accountId, cardId: item.cardId,
        paymentMethod: item.paymentMethod, tags: [], status: 'pending', recurrenceId: item.id, createdAt });
    }
    if (behind(item.generatedThrough)) plan.recurringThrough[item.id] = monthEnd;
  }

  for (const debt of debts.map(d => debtLedgerState(d, transactions)).filter(d => d.active)) {
    const recurrenceId = `debt:${debt.id}`;
    const dueDate = `${month}-${String(safeDay(debt.dueDay, year, monthIndex)).padStart(2, '0')}`;
    const from = debt.generatedThrough ?? lastKnownDate(recurrenceId, transactions);
    if ((!from || dueDate > from) && !live.has(`${recurrenceId}:${dueDate}`)) {
      plan.add.push({ id: newId(), kind: 'expense', amountCents: debt.installmentCents, date: dueDate, dueDate, categoryId: debt.categoryId,
        description: `Parcela · ${debt.name}`, accountId: debt.accountId, paymentMethod: 'boleto', tags: ['dívida'], status: 'pending', recurrenceId, relatedId: debt.id, createdAt });
    }
    if (behind(debt.generatedThrough)) plan.debtsThrough[debt.id] = monthEnd;
  }

  for (const goal of goals.filter(g => !g.archived && g.automaticMonthlyCents && g.automaticMonthlyCents > 0)) {
    const recurrenceId = `goal:${goal.id}`;
    if (!behind(goal.generatedThrough)) continue;
    const alreadyThisMonth = goal.generatedThrough ? goal.generatedThrough >= `${month}-01` : transactions.some(t => t.recurrenceId === recurrenceId && t.date.startsWith(month));
    if (!alreadyThisMonth) {
      // Meta com conta própria: o aporte sai de outra conta e entra na da meta. Sem outra conta, cai no comportamento antigo.
      const origin = goal.accountId ? accounts.filter(a => !a.archived && a.id !== goal.accountId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id : undefined;
      plan.add.push({ id: newId(), kind: 'goalContribution', amountCents: goal.automaticMonthlyCents!, date: today, dueDate: today, description: `Aporte automático · ${goal.name}`,
        accountId: origin ?? goal.accountId, goalAccountId: origin ? goal.accountId : undefined, relatedId: goal.id, tags: ['meta', 'aporte automático'], status: 'pending', recurrenceId, createdAt });
    }
    plan.goalsThrough[goal.id] = monthEnd;
  }
  return plan;
}

export function insightText(category: string, spent: number, budget: number): string | undefined {
  if (budget <= 0 || spent <= budget) return undefined;
  const delta = Math.round((spent - budget) * 100 / budget);
  return `${category} está ${delta}% acima do orçamento.`;
}
export function monthChangeInsight(category: string, current: number, previous: number): string | undefined {
  if (previous <= 0 || current === previous) return undefined;
  const delta = Math.round(Math.abs(current - previous) * 100 / previous);
  return `Você ${current < previous ? 'gastou' : 'gastou'} ${delta}% ${current < previous ? 'menos' : 'mais'} com ${category} que no mês passado.`;
}
export function goalPaceInsight(name: string, target: number, saved: number, monthsLeft: number): string | undefined {
  if (monthsLeft <= 0 || target <= 0 || saved >= target) return undefined;
  const needed = (target - saved) / monthsLeft;
  return needed > 0 ? `Para atingir ${name}, faltam ${monthsLeft} ${monthsLeft === 1 ? 'mês' : 'meses'}; são necessários ${Math.ceil(needed / 100)} por mês.` : undefined;
}
