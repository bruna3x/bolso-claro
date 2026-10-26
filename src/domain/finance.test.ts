import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import backup from '../../test/fixtures/backup-v1-teste.json';
import type { Account, CreditCard, Transaction } from '../types';
import { accountBalances, buildInvoices, goalBalanceCents, invoiceDueDate, invoiceMonthFor, isOverdue, monthTotals } from './finance';

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

describe('monthTotals (B4)', () => {
  const tx = (id: string, kind: Transaction['kind'], amountCents: number, extra: Partial<Transaction> = {}): Transaction => ({ id, kind, amountCents, date: '2026-10-10', description: 'TESTE', accountId: principal, tags: [], status: 'paid', createdAt: '2026-10-10T00:00:00Z', ...extra });

  it('no backup de teste, saiu = despesas pagas da conta + compras do cartão até hoje', () => {
    // Parcelas da dívida (2 × 1.000), plano de saúde (530) e compras no cartão de outubro (200 + 100 + 100).
    expect(monthTotals(transactions, '2026-10')).toEqual({ incomeCents: 0, expensesCents: 293_000, pendingCents: 0, pendingIncomeCents: 0, savedCents: 0 });
  });
  it('pendente não entra em "saiu" nem em "entrou": vira "a pagar" e "a receber"', () => {
    const extra = [
      tx('aluguel', 'expense', 150_000, { status: 'pending', date: '2026-10-28' }),
      tx('luz', 'expense', 20_000, { status: 'overdue', date: '2026-10-05' }),
      tx('salario', 'income', 500_000),
      tx('freela', 'income', 80_000, { status: 'pending', date: '2026-10-30' }),
    ];
    const totals = monthTotals([...transactions, ...extra], '2026-10');
    expect(totals.expensesCents).toBe(293_000);
    expect(totals.pendingCents).toBe(170_000);
    expect(totals.incomeCents).toBe(500_000);
    expect(totals.pendingIncomeCents).toBe(80_000);
  });
  it('compra no cartão conta pela data da compra, e não antes dela', () => {
    expect(monthTotals(transactions, '2026-12').expensesCents).toBe(0);
    vi.setSystemTime(new Date(2026, 11, 5, 12));
    expect(monthTotals(transactions, '2026-12').expensesCents).toBe(10_000);
    expect(monthTotals(transactions, '2026-12').pendingCents).toBe(0);
  });
  it('aporte pago é "guardado", não "saiu"', () => {
    const totals = monthTotals([tx('a', 'goalContribution', 30_000, { relatedId: 'meta' })], '2026-10');
    expect([totals.expensesCents, totals.savedCents]).toEqual([0, 30_000]);
  });
});

describe('isOverdue (B5)', () => {
  const base = { date: '2026-10-20', dueDate: undefined as string | undefined };
  it('é pendente com vencimento antes de hoje', () => {
    expect(isOverdue({ ...base, status: 'pending' })).toBe(true);
    expect(isOverdue({ ...base, status: 'pending', dueDate: '2026-10-30' })).toBe(false);
    expect(isOverdue({ ...base, status: 'pending', date: '2026-10-24' })).toBe(false);
  });
  it('pago nunca está atrasado; "overdue" gravado por versões antigas é lido como pendente', () => {
    expect(isOverdue({ ...base, status: 'paid' })).toBe(false);
    expect(isOverdue({ ...base, status: 'overdue', date: '2026-10-30' })).toBe(false);
    expect(isOverdue({ ...base, status: 'overdue' })).toBe(true);
  });
  it('vencido ontem vira atrasado sem regravar nada', () => {
    const pending = { ...base, status: 'pending' as const, date: '2026-10-25' };
    expect(isOverdue(pending)).toBe(false);
    vi.setSystemTime(new Date(2026, 9, 26, 12));
    expect(isOverdue(pending)).toBe(true);
  });
});

describe('accountBalances com meta (B2a)', () => {
  const total = (txs: Transaction[]) => Object.values(accountBalances(accounts, txs)).reduce((s, v) => s + v, 0);
  const aporte = (extra: Partial<Transaction>): Transaction => ({ id: 'ap', kind: 'goalContribution', amountCents: 50_000, date: '2026-10-24', description: 'TESTE aporte', accountId: principal, relatedId: 'meta', tags: ['meta'], status: 'paid', paidAt: '2026-10-24', createdAt: '2026-10-24T00:00:00Z', ...extra });

  it('aporte com conta da meta é transferência: o saldo total não muda', () => {
    const after = accountBalances(accounts, [...transactions, aporte({ goalAccountId: poupanca })]);
    expect(after).toEqual({ [principal]: 677_000, [poupanca]: 70_000 });
    expect(total([...transactions, aporte({ goalAccountId: poupanca })])).toBe(total(transactions));
  });
  it('resgate com conta da meta faz o inverso', () => {
    const resgate = aporte({ id: 'rs', kind: 'goalWithdrawal', amountCents: 5_000, goalAccountId: poupanca });
    expect(accountBalances(accounts, [...transactions, resgate])).toEqual({ [principal]: 732_000, [poupanca]: 15_000 });
  });
  it('aporte sem conta da meta (dados antigos) mantém o comportamento anterior', () => {
    expect(accountBalances(accounts, [...transactions, aporte({})])).toEqual({ [principal]: 677_000, [poupanca]: 20_000 });
  });
});
