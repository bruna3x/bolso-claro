import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import backup from '../../test/fixtures/backup-v1-teste.json';
import type { Account, CreditCard, Transaction } from '../types';
import { accountBalances, buildInvoices, goalBalanceCents, invoiceDueDate, invoiceMonthFor } from './finance';

// Backup fictício (todas as descrições começam com "TESTE"), exportado pelo app v1 em 19/10/2026.
const accounts = backup.data.accounts as Account[];
const cards = backup.data.cards as CreditCard[];
const transactions = backup.data.transactions as Transaction[];
const principal = '18beb9bd-3877-4fab-9f3c-638aeee2b9f6';
const poupanca = '4461e6b3-27ab-496a-882f-458b73fd8c68';
const cartao = '42b79c60-fe60-4864-8142-7988155c59ca';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 24, 12)); });
afterEach(() => { vi.useRealTimers(); });

describe('invoiceMonthFor', () => {
  it('compra até o dia do fechamento cai na fatura do mesmo mês', () => {
    expect(invoiceMonthFor('2026-10-04', 5)).toBe('2026-10');
    expect(invoiceMonthFor('2026-10-05', 5)).toBe('2026-10');
  });
  it('compra depois do fechamento cai na fatura seguinte, inclusive na virada do ano', () => {
    expect(invoiceMonthFor('2026-10-06', 5)).toBe('2026-11');
    expect(invoiceMonthFor('2026-12-20', 5)).toBe('2027-01');
  });
});

describe('invoiceDueDate', () => {
  it('usa o dia de vencimento e limita ao último dia do mês', () => {
    expect(invoiceDueDate('2026-10', 12)).toBe('2026-10-12');
    expect(invoiceDueDate('2027-02', 31)).toBe('2027-02-28');
  });
});

describe('accountBalances', () => {
  it('reproduz os saldos do backup de teste', () => {
    expect(accountBalances(accounts, transactions)).toEqual({ [principal]: 727_000, [poupanca]: 20_000 });
  });
  it('ignora excluídos, pendentes e lançamentos futuros', () => {
    const base: Transaction = { id: 'x', kind: 'expense', amountCents: 5_000, date: '2026-10-20', description: 'TESTE', accountId: poupanca, tags: [], status: 'paid', createdAt: '2026-10-20T00:00:00Z' };
    const extra: Transaction[] = [
      { ...base, id: 'a', deletedAt: '2026-10-21T00:00:00Z' },
      { ...base, id: 'b', status: 'pending' },
      { ...base, id: 'c', date: '2026-10-30' },
    ];
    expect(accountBalances(accounts, [...transactions, ...extra])[poupanca]).toBe(20_000);
  });
});

describe('buildInvoices', () => {
  it('agrupa as compras do cartão por fatura e ignora a parcela excluída', () => {
    const invoices = buildInvoices(cards, transactions);
    expect(invoices.map(i => [i.month, i.totalCents, i.remainingCents, i.status, i.dueDate])).toEqual([
      ['2026-10', 20_000, 20_000, 'closed', '2026-10-12'],
      ['2026-11', 20_000, 20_000, 'open', '2026-11-12'],
      ['2026-12', 10_000, 10_000, 'open', '2026-12-12'],
    ]);
    expect(invoices.every(i => i.cardId === cartao)).toBe(true);
  });
  it('abate o pagamento da fatura e marca como parcial ou paga', () => {
    const payment = (id: string, amountCents: number): Transaction => ({ id, kind: 'cardPayment', amountCents, date: '2026-10-12', description: 'TESTE pagamento', accountId: principal, cardId: cartao, invoiceMonth: '2026-10', tags: [], status: 'paid', paidAt: '2026-10-12', createdAt: '2026-10-12T00:00:00Z' });
    const [partial] = buildInvoices(cards, [...transactions, payment('p1', 5_000)], '2026-10');
    expect([partial.paidCents, partial.remainingCents, partial.status]).toEqual([5_000, 15_000, 'partial']);
    const [paid] = buildInvoices(cards, [...transactions, payment('p1', 5_000), payment('p2', 15_000)], '2026-10');
    expect([paid.remainingCents, paid.status]).toEqual([0, 'paid']);
  });
});

describe('goalBalanceCents', () => {
  it('soma aportes menos resgates pagos e não excluídos da meta', () => {
    const tx = (id: string, kind: Transaction['kind'], amountCents: number, extra: Partial<Transaction> = {}): Transaction => ({ id, kind, amountCents, date: '2026-10-10', description: 'TESTE meta', accountId: principal, relatedId: 'meta', tags: [], status: 'paid', createdAt: '2026-10-10T00:00:00Z', ...extra });
    expect(goalBalanceCents('meta', [
      tx('a', 'goalContribution', 10_000),
      tx('b', 'goalContribution', 5_000),
      tx('c', 'goalWithdrawal', 3_000),
      tx('d', 'goalContribution', 99_000, { deletedAt: '2026-10-11T00:00:00Z' }),
      tx('e', 'goalContribution', 99_000, { relatedId: 'outra' }),
    ])).toBe(12_000);
  });
});
