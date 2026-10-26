// Verificação de B2c: lista os aportes/resgates de cada meta num backup JSON v1.
// Uso: pnpm verifica-aportes caminho/do/backup.json
// Só lê o arquivo e escreve no terminal. Não grava nada e não acessa a rede.
import { readFileSync } from 'node:fs';
import { auditGoalMovements } from '../src/domain/goalAudit.ts';

const path = process.argv[2];
if (!path) { console.error('Uso: pnpm verifica-aportes caminho/do/backup.json'); process.exit(1); }

const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const kinds: Record<string, string> = { expense: 'despesa', income: 'receita', transfer: 'transferência', adjustment: 'ajuste', reimbursement: 'reembolso', cardPayment: 'pag. fatura' };
const date = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const report = auditGoalMovements(JSON.parse(readFileSync(path, 'utf8')));
if (!report.goals.length) console.log('Nenhuma meta nem aporte/resgate no backup.');
for (const goal of report.goals) {
  console.log(`\n== ${goal.name} (${goal.situation})`);
  if (!goal.movements.length) console.log('   sem aportes nem resgates');
  for (const m of goal.movements) {
    const destination = m.goalAccount ? (m.kind === 'aporte' ? ` → ${m.goalAccount}` : ` ← ${m.goalAccount}`) : '';
    console.log(`   ${date(m.date)}  ${m.kind.padEnd(7)} ${money(m.amountCents).padStart(14)}  ${m.account}${destination}${m.counted ? '' : `  [${m.status}, fora do acumulado]`}`);
  }
  console.log(`   Acumulado: ${money(goal.accumulatedCents)}`);
}
if (report.suspects.length) {
  console.log('\n== Lançamentos que parecem aporte/resgate mas não são (possível B2b)');
  for (const s of report.suspects) console.log(`   ${date(s.date)}  ${(kinds[s.kind] ?? s.kind).padEnd(13)} ${money(s.amountCents).padStart(14)}  ${s.description}`);
}
if (report.legacyMovements) console.log(`\nA tabela antiga goalMovements ainda tem ${report.legacyMovements} registro(s): ela é convertida e esvaziada na próxima abertura do app.`);
