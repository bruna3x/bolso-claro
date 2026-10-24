export type AccountType = 'checking' | 'savings' | 'cash' | 'investment' | 'meal';
export type EntryKind = 'income' | 'expense' | 'reimbursement' | 'transfer' | 'adjustment' | 'goalContribution' | 'goalWithdrawal' | 'cardPayment';
export type PaymentMethod = 'cash' | 'pix' | 'debit' | 'credit' | 'boleto' | 'transfer' | 'voucher';
export type EntryStatus = 'paid' | 'pending' | 'overdue';
export type Frequency = 'weekly' | 'fortnightly' | 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual';

export interface Account {
  id: string; name: string; type: AccountType; initialBalanceCents: number; color: string; icon: string;
  includeInTotal: boolean; archived: boolean; createdAt: string;
}
export interface CreditCard {
  id: string; name: string; brand: string; limitCents: number; closingDay: number; dueDay: number;
  paymentAccountId: string; color: string; archived: boolean;
}
export interface Attachment { name: string; mimeType: string; size: number; blob: Blob; }
export interface Transaction {
  id: string; kind: EntryKind; amountCents: number; date: string; categoryId?: string; subcategory?: string;
  description: string; accountId?: string; destinationAccountId?: string; cardId?: string; paymentMethod?: PaymentMethod;
  tags: string[]; notes?: string; attachment?: Attachment; status: EntryStatus; dueDate?: string; paidAt?: string;
  seriesId?: string; installmentIndex?: number; installmentCount?: number; recurrenceId?: string;
  invoiceMonth?: string; relatedId?: string; createdAt: string; deletedAt?: string;
}
export interface Category { id: string; name: string; kind: 'income' | 'expense'; color: string; icon: string; subcategories: string[]; archived?: boolean; }
export interface Budget { id: string; month: string; categoryId: string; subcategory?: string; amountCents: number; }
export interface RecurringItem {
  id: string; name: string; kind: 'income' | 'expense'; amountCents: number; variable: boolean; categoryId: string;
  accountId?: string; cardId?: string; paymentMethod: PaymentMethod; frequency: Frequency; dueDay: number;
  startDate: string; endDate?: string; active: boolean; pausedAt?: string; lastGeneratedFor?: string;
}
export interface Debt {
  id: string; name: string; creditor: string; kind: string; originalCents: number; balanceCents: number;
  monthlyRateBps: number; installmentCount: number; paidInstallments: number; installmentCents: number;
  dueDay: number; payoffDate?: string; accountId?: string; categoryId: string; active: boolean;
  interestPaidCents: number; createdAt: string;
  openingBalanceCents?: number; openingPaidInstallments?: number; openingInterestPaidCents?: number;
}
export interface Goal {
  id: string; name: string; icon: string; targetCents: number; deadline?: string; accountId?: string;
  priority: 'high' | 'medium' | 'low'; kind: 'save' | 'debt' | 'emergency'; debtId?: string; automaticMonthlyCents?: number;
  createdAt: string; archived?: boolean;
}
export interface GoalMovement { id: string; goalId: string; date: string; amountCents: number; kind: 'deposit' | 'withdrawal'; accountId?: string; note?: string; }
export interface Receivable {
  id: string; origin: 'split' | 'reimbursement'; person: string; description: string; amountCents: number;
  receivedCents: number; originalTransactionId?: string; dueDate?: string; receivedAt?: string; status: 'pending' | 'partial' | 'received';
}
export interface PlannedExpense { id: string; name: string; month: string; amountCents: number; categoryId: string; convertedTransactionId?: string; }
export interface BudgetRule { id: string; contains: string; categoryId: string; paymentMethod?: PaymentMethod; }
export interface SavedFilter { id: string; name: string; filters: Record<string, string>; }
export interface Snapshot { id: string; month: string; netWorthCents: number; accountTotalCents: number; cardDebtCents: number; debtCents: number; createdAt: string; }
export interface TrashItem { id: string; entity: 'transaction' | 'account' | 'card' | 'budget' | 'recurring' | 'debt' | 'goal' | 'planned'; entityId: string; deletedAt: string; data: unknown; }
export interface AppSettings {
  id: 'app'; monthStartDay: number; privacyMode: boolean; theme: 'light' | 'dark'; currency: 'BRL';
  lastBackupReminder?: string; notificationsEnabled: boolean; sampleDataLoaded: boolean;
}
export interface Invoice {
  id: string; cardId: string; month: string; purchases: Transaction[]; totalCents: number;
  paidCents: number; remainingCents: number; status: 'open' | 'closed' | 'paid' | 'partial'; dueDate: string;
}
