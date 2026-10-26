import Dexie, { type EntityTable } from 'dexie';
import type { Account, AppSettings, Budget, BudgetRule, Category, CreditCard, Debt, Goal, GoalMovement, PlannedExpense, Receivable, RecurringItem, SavedFilter, Snapshot, Transaction, TrashItem } from '../types';

class FinanceDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  cards!: EntityTable<CreditCard, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  recurring!: EntityTable<RecurringItem, 'id'>;
  debts!: EntityTable<Debt, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  goalMovements!: EntityTable<GoalMovement, 'id'>;
  receivables!: EntityTable<Receivable, 'id'>;
  planned!: EntityTable<PlannedExpense, 'id'>;
  rules!: EntityTable<BudgetRule, 'id'>;
  filters!: EntityTable<SavedFilter, 'id'>;
  snapshots!: EntityTable<Snapshot, 'id'>;
  trash!: EntityTable<TrashItem, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
  constructor() {
    super('BolsoClaro');
    // `lastGeneratedFor` ficou no índice de `recurring` só porque mudar o esquema exige a versão 2 (F3).
    // O campo saiu do tipo; o marcador de geração agora é `generatedThrough` (B3).
    this.version(1).stores({
      accounts: 'id,name,type,archived', cards: 'id,name,archived',
      transactions: 'id,date,kind,categoryId,accountId,cardId,status,recurrenceId,seriesId,deletedAt,[date+amountCents+description]',
      categories: 'id,name,kind,archived', budgets: 'id,month,categoryId,[month+categoryId]',
      recurring: 'id,active,categoryId,startDate,lastGeneratedFor', debts: 'id,active,dueDay',
      goals: 'id,priority,deadline', goalMovements: 'id,goalId,date,[goalId+date]',
      receivables: 'id,origin,status,dueDate,originalTransactionId', planned: 'id,month,categoryId',
      rules: 'id,contains', filters: 'id,name', snapshots: 'id,month', trash: 'id,deletedAt,entity', settings: 'id'
    });
  }
}

export const db = new FinanceDB();

export const DEFAULT_CATEGORIES: Category[] = [
  ...[
    ['Moradia', '#7C6EE6', 'Casa'], ['Alimentação', '#4D9C72', 'Cesta'], ['Restaurantes', '#E88B45', 'Talheres'],
    ['Transporte', '#4C8FC6', 'Carro'], ['Saúde', '#D16C78', 'Cruz'], ['Educação', '#8C6AB8', 'Livro'],
    ['Lazer', '#D070A3', 'Estrela'], ['Vestuário', '#C39148', 'Cabide'], ['Assinaturas', '#557C83', 'Play'],
    ['Pets', '#A67852', 'Pata'], ['Presentes', '#D46761', 'Presente'], ['Impostos', '#7B7E87', 'Documento'],
    ['Investimentos', '#337B6B', 'Gráfico'], ['Dívidas', '#B45D58', 'Cartão'], ['Outros', '#88918C', 'Ponto']
  ].map(([name, color, icon], i) => ({ id: `expense-${i + 1}`, name, kind: 'expense' as const, color, icon, subcategories: [] })),
  ...[
    ['Salário', '#4D9C72'], ['Extra', '#64A68A'], ['Reembolso', '#7799C2'], ['Rendimentos', '#C39148'], ['Outros', '#88918C']
  ].map(([name, color], i) => ({ id: `income-${i + 1}`, name, kind: 'income' as const, color, icon: 'Entrada', subcategories: [] }))
];

export async function initializeDatabase(): Promise<void> {
  await db.open();
  await db.transaction('rw', db.categories, db.settings, async () => {
    if (await db.categories.count() === 0) await db.categories.bulkAdd(DEFAULT_CATEGORIES);
    if (!(await db.settings.get('app'))) {
      await db.settings.add({ id: 'app', monthStartDay: 1, privacyMode: false, theme: 'light', currency: 'BRL', notificationsEnabled: false, sampleDataLoaded: false });
    }
  });
  try { await navigator.storage?.persist?.(); } catch { /* Navegador pode negar sem interromper o app. */ }
}
