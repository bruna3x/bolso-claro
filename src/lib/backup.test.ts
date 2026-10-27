import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import backupV1 from '../../test/fixtures/backup-v1-teste.json';
import { db } from '../db';
import { accountBalances } from '../domain/finance';
import type { Account, Transaction } from '../types';
import { createBackup, restoreBackup } from './backup';

const TABLES = ['accounts', 'cards', 'transactions', 'categories', 'budgets', 'recurring', 'debts', 'goals', 'goalMovements', 'receivables', 'planned', 'rules', 'filters', 'snapshots', 'trash', 'settings'];
const byId = (rows: unknown[]) => [...rows].sort((a, b) => String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)));

describe('backup JSON: restaurar e exportar de novo', () => {
  beforeAll(async () => { await db.open(); await restoreBackup(structuredClone(backupV1)); });
  afterAll(async () => { db.close(); await db.delete(); });

  it('restaurar o backup de teste mostra os mesmos saldos', async () => {
    const [accounts, transactions] = await Promise.all([db.accounts.toArray(), db.transactions.toArray()]);
    const [principal, poupanca] = backupV1.data.accounts.map(a => a.id);
    expect(accountBalances(accounts as Account[], transactions as Transaction[])).toEqual({ [principal]: 727_000, [poupanca]: 20_000 });
  });

  it('exportar depois de restaurar produz as mesmas 16 tabelas, com a mesma contagem e o mesmo conteúdo', async () => {
    const exported = await createBackup();
    expect(exported.format).toBe('bolso-claro-backup');
    expect(exported.version).toBe(1);
    expect(Object.keys(exported.data).sort()).toEqual([...TABLES].sort());
    expect(Object.keys(backupV1.data).sort()).toEqual([...TABLES].sort());
    const source = backupV1.data as Record<string, unknown[]>;
    const output = exported.data as Record<string, unknown[]>;
    for (const table of TABLES) {
      expect(output[table].length, table).toBe(source[table].length);
      expect(byId(output[table]), table).toEqual(byId(source[table]));
    }
  });
});
