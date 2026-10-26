// Só imports de tipo: este módulo também roda direto no Node (scripts/verifica-aportes.ts), sem bundler.
import type { Account, Goal, GoalMovement, Transaction, TrashItem } from '../types';

export interface AuditMovement { id: string; date: string; kind: 'aporte' | 'resgate'; amountCents: number; account: string; goalAccount?: string; status: string; counted: boolean }
export interface GoalAudit { goalId: string; name: string; situation: 'ativa' | 'arquivada' | 'na lixeira' | 'meta não encontrada'; movements: AuditMovement[]; accumulatedCents: number }
export interface AuditReport { goals: GoalAudit[]; suspects: { id: string; date: string; kind: string; amountCents: number; description: string }[]; legacyMovements: number }

interface BackupV1Data { accounts?: Account[]; goals?: Goal[]; transactions?: Transaction[]; trash?: TrashItem[]; goalMovements?: GoalMovement[] }

/** Lista, por meta, cada aporte/resgate do backup v1 e o acumulado (mesma regra de `goalBalanceCents`). Verificação de B2c. */
export function auditGoalMovements(backup: unknown): AuditReport {
  const root = backup as { format?: string; version?: number; data?: BackupV1Data };
  if (!root || root.format !== 'bolso-claro-backup' || root.version !== 1 || !root.data) throw new Error('Arquivo não é um backup v1 do Bolso Claro.');
  const { accounts = [], goals = [], transactions = [], trash = [], goalMovements = [] } = root.data;
  const accountName = (id?: string) => id ? accounts.find(a => a.id === id)?.name ?? `conta ${id.slice(0, 8)}` : 'sem conta';
  const trashedGoals = trash.filter(item => item.entity === 'goal').map(item => item.data as Goal);
  const movements = transactions.filter(tx => tx.kind === 'goalContribution' || tx.kind === 'goalWithdrawal');
  const ids = [...new Set([...goals.map(g => g.id), ...trashedGoals.map(g => g.id), ...movements.map(tx => tx.relatedId ?? '')])];
  const report: AuditReport = { goals: [], suspects: [], legacyMovements: goalMovements.length };
  for (const goalId of ids) {
    const goal = goals.find(g => g.id === goalId); const trashed = trashedGoals.find(g => g.id === goalId);
    const rows = movements.filter(tx => (tx.relatedId ?? '') === goalId).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)).map((tx): AuditMovement => {
      const counted = !tx.deletedAt && tx.status === 'paid';
      return { id: tx.id, date: tx.date, kind: tx.kind === 'goalContribution' ? 'aporte' : 'resgate', amountCents: tx.amountCents, account: accountName(tx.accountId),
        goalAccount: tx.goalAccountId ? accountName(tx.goalAccountId) : undefined, status: tx.deletedAt ? 'excluído' : tx.status === 'paid' ? 'pago' : 'pendente', counted };
    });
    const accumulatedCents = Math.max(0, rows.filter(r => r.counted).reduce((sum, r) => sum + (r.kind === 'aporte' ? r.amountCents : -r.amountCents), 0));
    report.goals.push({ goalId, name: goal?.name ?? trashed?.name ?? '(sem nome)', situation: goal ? (goal.archived ? 'arquivada' : 'ativa') : trashed ? 'na lixeira' : 'meta não encontrada', movements: rows, accumulatedCents });
  }
  // Aporte que virou despesa/receita pelo select "Tipo" (B2b) mantém a descrição "Aporte · …" ou a tag "meta".
  for (const tx of transactions) {
    if (tx.kind === 'goalContribution' || tx.kind === 'goalWithdrawal') continue;
    if (/^(Aporte|Resgate)( automático)? ·/.test(tx.description ?? '') || tx.tags?.includes('meta')) report.suspects.push({ id: tx.id, date: tx.date, kind: tx.kind, amountCents: tx.amountCents, description: tx.description });
  }
  return report;
}
