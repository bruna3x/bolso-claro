import { db } from '../db';
import type { Attachment } from '../types';

const tableNames = ['accounts','cards','transactions','categories','budgets','recurring','debts','goals','goalMovements','receivables','planned','rules','filters','snapshots','trash','settings'] as const;
type TableName = typeof tableNames[number];
type Backup = { format: 'bolso-claro-backup'; version: 1; createdAt: string; data: Record<TableName, unknown[]> };
const toBase64 = async (blob: Blob): Promise<string> => { const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); };
const fromBase64 = (value: string, type: string): Blob => { const raw = atob(value); const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return new Blob([bytes], { type }); };
async function encodeAttachment(value: unknown): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map(encodeAttachment));
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>; const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(object)) {
    if (key === 'attachment' && item && typeof item === 'object' && 'blob' in item) {
      const a = item as Attachment; out[key] = { name: a.name, mimeType: a.mimeType, size: a.size, base64: await toBase64(a.blob) };
    } else out[key] = await encodeAttachment(item);
  }
  return out;
}
async function decodeAttachment(value: unknown): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map(decodeAttachment));
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>; const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(object)) {
    if (key === 'attachment' && item && typeof item === 'object' && 'base64' in item) {
      const a = item as { name: string; mimeType: string; size: number; base64: string };
      out[key] = { name: a.name, mimeType: a.mimeType, size: a.size, blob: fromBase64(a.base64, a.mimeType) };
    } else out[key] = await decodeAttachment(item);
  }
  return out;
}
export async function createBackup(): Promise<Backup> {
  const data = {} as Record<TableName, unknown[]>;
  for (const name of tableNames) data[name] = await encodeAttachment(await db.table(name).toArray()) as unknown[];
  return { format: 'bolso-claro-backup', version: 1, createdAt: new Date().toISOString(), data };
}
export async function restoreBackup(value: unknown): Promise<void> {
  if (!value || typeof value !== 'object' || (value as Backup).format !== 'bolso-claro-backup' || (value as Backup).version !== 1 || !(value as Backup).data) throw new Error('Arquivo de backup inválido ou incompatível.');
  const backup = value as Backup;
  const decoded = {} as Record<TableName, unknown[]>;
  for (const name of tableNames) decoded[name] = await decodeAttachment(backup.data[name] ?? []) as unknown[];
  await db.transaction('rw', tableNames.map(name => db.table(name)), async () => {
    for (const name of tableNames) { await db.table(name).clear(); await db.table(name).bulkPut(decoded[name] as never[]); }
  });
}
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
