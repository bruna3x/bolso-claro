import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import backup from '../../test/fixtures/backup-v1-teste.json';
import type { Account, Goal, Transaction } from '../types';
import { accountBalances, goalBalanceCents, monthTotals } from './finance';
import { buildGoalMovement, editFormFor } from './goals';

const accounts = backup.data.accounts as Account[];
const transactions = backup.data.transactions as Transaction[];
const principal = accounts[0].id;
const poupanca = accounts[1].id;
const goal = (extra: Partial<Goal> = {}): Goal => ({ id: 'meta', name: 'TESTE viagem', icon: 'Alvo', targetCents: 500_000, priority: 'medium', kind: 'save', createdAt: '2026-10-01T00:00:00Z', ...extra });
const total = (txs: Transaction[]) => Object.values(accountBalances(accounts, txs)).reduce((s, v) => s + v, 0);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 24, 12)); });
afterEach(() => { vi.useRealTimers(); });

describe('editFormFor (B2b)', () => {
  it('aporte e resgate abrem o formulário de meta; o resto, o de lançamento', () => {
    expect(editFormFor({ kind: 'goalContribution' })).toBe('deposit');
    expect(editFormFor({ kind: 'goalWithdrawal' })).toBe('deposit');
    expect(editFormFor({ kind: 'expense' })).toBe('entry');
    expect(editFormFor({ kind: 'transfer' })).toBe('entry');
  });
});

describe('buildGoalMovement', () => {
  it('B2a: aporte em meta com conta debita a origem, credita a meta e não muda o saldo total nem "saiu"', () => {
    const aporte = buildGoalMovement({ goal: goal({ accountId: poupanca }), withdrawal: false, amountCents: 50_000, date: '2026-10-24', accountId: principal });
    const after = [...transactions, aporte];
    expect(total(after)).toBe(total(transactions));
    expect(accountBalances(accounts, after)).toEqual({ [principal]: 677_000, [poupanca]: 70_000 });
    expect(monthTotals(after, '2026-10').expensesCents).toBe(monthTotals(transactions, '2026-10').expensesCents);
    expect(goalBalanceCents('meta', after)).toBe(50_000);
  });
  it('B2a: resgate faz o inverso', () => {
    const meta = goal({ accountId: poupanca });
    const aporte = buildGoalMovement({ goal: meta, withdrawal: false, amountCents: 50_000, date: '2026-10-24', accountId: principal });
    const resgate = buildGoalMovement({ goal: meta, withdrawal: true, amountCents: 20_000, date: '2026-10-24', accountId: principal });
    const after = [...transactions, aporte, resgate];
    expect(accountBalances(accounts, after)).toEqual({ [principal]: 697_000, [poupanca]: 50_000 });
    expect(goalBalanceCents('meta', after)).toBe(30_000);
  });
  it('B2a: meta sem conta mantém o comportamento anterior (só debita a origem)', () => {
    const aporte = buildGoalMovement({ goal: goal(), withdrawal: false, amountCents: 50_000, date: '2026-10-24', accountId: principal });
    expect(aporte.goalAccountId).toBeUndefined();
    expect(total([...transactions, aporte])).toBe(total(transactions) - 50_000);
  });
  it('B2a: recusa origem igual à conta da meta ou vazia', () => {
    expect(() => buildGoalMovement({ goal: goal({ accountId: poupanca }), withdrawal: false, amountCents: 1_000, date: '2026-10-24', accountId: poupanca })).toThrow(/diferente/);
    expect(() => buildGoalMovement({ goal: goal({ accountId: poupanca }), withdrawal: false, amountCents: 1_000, date: '2026-10-24' })).toThrow(/origem/);
  });
  it('B2b: editar um aporte continua aporte, na mesma meta, e mantém id, status e descrição', () => {
    const original: Transaction = { id: 'ap', kind: 'goalContribution', amountCents: 10_000, date: '2026-10-01', description: 'Aporte automático · TESTE viagem', accountId: principal, relatedId: 'meta', recurrenceId: 'goal:meta', tags: ['meta', 'aporte automático'], status: 'pending', createdAt: '2026-10-01T00:00:00Z' };
    const edited = buildGoalMovement({ goal: goal(), withdrawal: false, amountCents: 12_000, date: '2026-10-05', accountId: principal, entry: original });
    expect(edited).toMatchObject({ id: 'ap', kind: 'goalContribution', amountCents: 12_000, date: '2026-10-05', relatedId: 'meta', recurrenceId: 'goal:meta', status: 'pending', description: original.description, createdAt: original.createdAt });
  });
  it('B2a: editar aporte antigo depois de dar conta à meta não muda saldos', () => {
    const old = buildGoalMovement({ goal: goal(), withdrawal: false, amountCents: 30_000, date: '2026-10-10', accountId: principal });
    const edited = buildGoalMovement({ goal: goal({ accountId: poupanca }), withdrawal: false, amountCents: 30_000, date: '2026-10-11', accountId: principal, entry: old });
    expect(edited.goalAccountId).toBeUndefined();
    expect(accountBalances(accounts, [...transactions, edited])).toEqual(accountBalances(accounts, [...transactions, old]));
  });
});
