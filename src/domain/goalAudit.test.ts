import { describe, expect, it } from 'vitest';
import backup from '../../test/fixtures/backup-v1-teste.json';
import type { Goal, Transaction } from '../types';
import { goalBalanceCents } from './finance';
import { auditGoalMovements } from './goalAudit';

const principal = backup.data.accounts[0].id;
const poupanca = backup.data.accounts[1].id;
const tx = (id: string, kind: Transaction['kind'], amountCents: number, date: string, extra: Partial<Transaction> = {}): Transaction => ({ id, kind, amountCents, date, description: `TESTE ${id}`, accountId: principal, relatedId: 'viagem', tags: ['meta'], status: 'paid', createdAt: `${date}T00:00:00Z`, ...extra });
const goal: Goal = { id: 'viagem', name: 'TESTE viagem', icon: 'Alvo', targetCents: 500_000, priority: 'medium', kind: 'save', createdAt: '2026-10-01T00:00:00Z' };
const movements = [
  tx('b', 'goalContribution', 20_000, '2026-10-15', { goalAccountId: poupanca }),
  tx('a', 'goalContribution', 10_000, '2026-10-01'),
  tx('c', 'goalWithdrawal', 5_000, '2026-10-20'),
  tx('d', 'goalContribution', 99_000, '2026-10-21', { deletedAt: '2026-10-22T00:00:00Z' }),
  tx('e', 'goalContribution', 7_000, '2026-10-01', { relatedId: 'apagada' }),
];
const withGoals = { ...backup, data: { ...backup.data, goals: [goal], transactions: [...backup.data.transactions, ...movements, tx('f', 'expense', 3_000, '2026-10-02', { description: 'Aporte · TESTE viagem', relatedId: undefined })],
  trash: [...backup.data.trash, { id: 't', entity: 'goal', entityId: 'apagada', deletedAt: '2026-10-23T00:00:00Z', data: { ...goal, id: 'apagada', name: 'TESTE apagada' } }] } };

describe('auditGoalMovements (B2c)', () => {
  it('backup de teste não tem metas', () => {
    expect(auditGoalMovements(backup)).toEqual({ goals: [], suspects: [], legacyMovements: 0 });
  });
  it('lista cada movimento por data, com conta, e o acumulado igual a goalBalanceCents', () => {
    const [viagem, apagada] = auditGoalMovements(withGoals).goals;
    expect(viagem.situation).toBe('ativa');
    expect(viagem.movements.map(m => [m.id, m.date, m.kind, m.amountCents, m.account, m.goalAccount, m.counted])).toEqual([
      ['a', '2026-10-01', 'aporte', 10_000, 'TESTE · Conta Principal', undefined, true],
      ['b', '2026-10-15', 'aporte', 20_000, 'TESTE · Conta Principal', 'TESTE · Poupança', true],
      ['c', '2026-10-20', 'resgate', 5_000, 'TESTE · Conta Principal', undefined, true],
      ['d', '2026-10-21', 'aporte', 99_000, 'TESTE · Conta Principal', undefined, false],
    ]);
    expect(viagem.accumulatedCents).toBe(25_000);
    expect(goalBalanceCents('viagem', movements)).toBe(25_000);
    expect([apagada.name, apagada.situation, apagada.accumulatedCents]).toEqual(['TESTE apagada', 'na lixeira', 7_000]);
  });
  it('aponta despesa com cara de aporte (possível conversão pelo B2b)', () => {
    expect(auditGoalMovements(withGoals).suspects.map(s => s.id)).toEqual(['f']);
  });
  it('recusa arquivo que não é backup v1', () => {
    expect(() => auditGoalMovements({ format: 'outro' })).toThrow(/backup v1/);
  });
});
