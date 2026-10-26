import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import backup from '../../test/fixtures/backup-v1-teste.json';
import type { Account, Debt, Goal, RecurringItem, Transaction } from '../types';
import { planObligations } from './recurring';

// Backup fictício: recorrente "Plano de saúde" (dia 20, desde 19/10) e dívida "Empréstimo 10x" (dia 20).
const accounts = backup.data.accounts as Account[];
const fixture = backup.data.transactions as Transaction[];
const plano = (backup.data.recurring as RecurringItem[])[0];
const emprestimo = (backup.data.debts as Debt[])[0];
const principal = accounts[0].id;
const poupanca = accounts[1].id;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 2, 12)); });
afterEach(() => { vi.useRealTimers(); });

/** Simula aberturas do app: aplica o plano e devolve o estado gravado. */
function open(state: { recurring: RecurringItem[]; debts: Debt[]; goals: Goal[]; transactions: Transaction[] }, today: string) {
  const plan = planObligations({ ...state, accounts, today });
  return {
    plan,
    recurring: state.recurring.map(r => ({ ...r, generatedThrough: plan.recurringThrough[r.id] ?? r.generatedThrough })),
    debts: state.debts.map(d => ({ ...d, generatedThrough: plan.debtsThrough[d.id] ?? d.generatedThrough })),
    goals: state.goals.map(g => ({ ...g, generatedThrough: plan.goalsThrough[g.id] ?? g.generatedThrough })),
    transactions: [...state.transactions, ...plan.add],
  };
}
const series = (txs: Transaction[], id: string) => txs.filter(t => t.recurrenceId === id).map(t => t.date).sort();

describe('planObligations (B3)', () => {
  it('backup antigo sem marcador: não duplica o que existe e marca até o fim do mês', () => {
    const { plan } = open({ recurring: [plano], debts: [emprestimo], goals: [], transactions: fixture }, '2026-10-24');
    expect(plan.add).toEqual([]);
    expect(plan.recurringThrough).toEqual({ [plano.id]: '2026-10-31' });
    expect(plan.debtsThrough).toEqual({ [emprestimo.id]: '2026-10-31' });
  });

  it('no mês seguinte gera só a ocorrência nova, sempre pendente', () => {
    const october = open({ recurring: [plano], debts: [emprestimo], goals: [], transactions: fixture }, '2026-10-24');
    const { plan } = open(october, '2026-11-02');
    expect(plan.add.map(t => [t.recurrenceId, t.date, t.status])).toEqual([
      [plano.id, '2026-11-20', 'pending'],
      [`debt:${emprestimo.id}`, '2026-11-20', 'pending'],
    ]);
  });

  it('ocorrência excluída (lixeira) ou expurgada não volta na próxima abertura', () => {
    const november = open(open({ recurring: [plano], debts: [emprestimo], goals: [], transactions: fixture }, '2026-10-24'), '2026-11-02');
    const isNew = (t: Transaction) => t.date === '2026-11-20';
    const trashed = { ...november, transactions: november.transactions.map(t => isNew(t) ? { ...t, deletedAt: '2026-11-03T00:00:00Z' } : t) };
    expect(open(trashed, '2026-11-05').plan.add).toEqual([]);
    const purged = { ...november, transactions: november.transactions.filter(t => !isNew(t)) };
    expect(open(purged, '2026-12-03').plan.add.map(t => t.date)).toEqual(['2026-12-20', '2026-12-20']);
    expect(series(open(purged, '2026-12-03').transactions, plano.id)).toEqual(['2026-10-20', '2026-12-20']);
  });

  it('dados antigos sem marcador: ocorrência na lixeira também não volta', () => {
    const trashed = fixture.map(t => t.recurrenceId === plano.id ? { ...t, deletedAt: '2026-10-21T00:00:00Z' } : t);
    expect(open({ recurring: [plano], debts: [], goals: [], transactions: trashed }, '2026-10-24').plan.add).toEqual([]);
  });

  it('recorrente pausado não gera nem avança o marcador; ao reativar gera o que faltou', () => {
    const paused = { ...plano, active: false, generatedThrough: '2026-10-31' };
    const pausedRun = open({ recurring: [paused], debts: [], goals: [], transactions: fixture }, '2026-12-02');
    expect(pausedRun.plan.add).toEqual([]);
    expect(pausedRun.plan.recurringThrough).toEqual({});
    const resumed = open({ ...pausedRun, recurring: [{ ...paused, active: true }] }, '2026-12-02');
    expect(resumed.plan.add.map(t => t.date)).toEqual(['2026-11-20', '2026-12-20']);
  });

  it('aporte automático: um por mês, e excluído não volta', () => {
    const goal: Goal = { id: 'meta', name: 'TESTE viagem', icon: 'Alvo', targetCents: 100_000, priority: 'medium', kind: 'save', automaticMonthlyCents: 10_000, createdAt: '2026-10-01T00:00:00Z' };
    const first = open({ recurring: [], debts: [], goals: [goal], transactions: [] }, '2026-11-02');
    expect(first.plan.add.map(t => [t.kind, t.amountCents, t.status, t.accountId, t.goalAccountId])).toEqual([['goalContribution', 10_000, 'pending', undefined, undefined]]);
    const purged = { ...first, transactions: [] };
    expect(open(purged, '2026-11-20').plan.add).toEqual([]);
    expect(open(purged, '2026-12-01').plan.add).toHaveLength(1);
  });

  it('aporte automático em meta com conta sai de outra conta e entra na da meta', () => {
    const goal: Goal = { id: 'meta', name: 'TESTE reserva', icon: 'Alvo', targetCents: 100_000, priority: 'medium', kind: 'emergency', accountId: poupanca, automaticMonthlyCents: 10_000, createdAt: '2026-10-01T00:00:00Z' };
    const [tx] = open({ recurring: [], debts: [], goals: [goal], transactions: [] }, '2026-11-02').plan.add;
    expect([tx.accountId, tx.goalAccountId]).toEqual([principal, poupanca]);
  });
});
