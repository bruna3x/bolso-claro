# Bolso Claro

PWA de finanças pessoais de uma única usuária: React + Vite + Dexie (IndexedDB), sem backend, pt-BR, BRL.
Uso diário no celular (registrar gasto em menos de 10 s) e semanal no desktop (conferir o orçamento).

O plano aprovado está em `PLANO.md`: auditoria, mapa de funcionalidades, modelo, wireframes e fases F0–F6. Leia antes de mudar qualquer coisa. Decisões ainda abertas ficam na seção 6 do plano. Não as decida sozinho: pergunte e registre a resposta lá.

## Princípios (valem para toda mudança)

1. A primeira tela responde, sem rolar: quanto entrou, quanto saiu, quanto posso gastar até o fim do mês.
2. Registrar um gasto comum exige no máximo 3 campos (valor, categoria, descrição opcional). O resto fica atrás de "mais opções".
3. Cada informação aparece num lugar só. Se duas telas mostram a mesma coisa, uma sai.
4. O que a usuária não usaria toda semana sai da v1. Pode voltar na v2.
5. Dados 100% locais (IndexedDB). Nenhum analytics, telemetria, fonte ou script de terceiros. A hospedagem também não pode injetar nada.
6. Nunca perder dados: export/import continuam funcionando, e todo backup antigo continua importável.

## Estado atual do código

- F0 concluída: árvore `src/` recriada, build com lockfile, Vitest (`src/**/*.test.ts`) e deploy no GitHub Pages em `/bolso-claro/` via `.github/workflows/deploy.yml`. O backup fictício de teste fica em `test/fixtures/backup-v1-teste.json`.
- O código em produção ainda usa o **modelo v1**: Dexie versão 1, 16 tabelas, `Transaction` com 8 `kind`s (ver `types.ts` e `index.ts`). O modelo v2 abaixo só entra na F3.
- Bugs conhecidos e abertos: B2a, B2b, B3, B4, B5, B6, B7 e B8, descritos na seção 1.5 do plano.

## Modelo de dados alvo (v2, Dexie versão 2)

```ts
accounts:     { id, name, type: 'account' | 'card', initialBalanceCents, includeInTotal, archived, createdAt,
                limitCents?, closingDay?, dueDay?, payFromAccountId? }          // campos de cartão
transactions: { id, kind: 'income' | 'expense' | 'transfer' | 'adjustment',
                amountCents, date, status: 'paid' | 'pending',
                description, categoryId?, accountId, toAccountId?,
                recurringId?, installment?: { seriesId, index, count },
                invoiceMonth?, goalId?, createdAt, updatedAt, legacy?: object }
categories:   { id, name, kind: 'income' | 'expense', color, archived }
budgets:      { categoryId (chave), amountCents }        // vale até mudar, sem mês
recurring:    { id, name, kind: 'income' | 'expense', amountCents, variable, categoryId, accountId,
                frequency, dayOfMonth, startDate, endDate?, active, generatedThrough? }
goals:        { id, name, targetCents, deadline?, accountId?, archived, createdAt }
settings:     { id: 'app', privacyMode, lastBackupAt?, monthStartDay, defaultAccountId? }
archive:      { id: '<tabela v1>', rows: unknown[] }    // tudo que saiu da interface
```

Regras do modelo:

- **Dinheiro em centavos inteiros.** Nunca use float para valores.
- **Tudo derivado dos lançamentos.** Saldo de conta, fatura, acumulado de meta e parcelas restantes são calculados, nunca guardados num campo somado à parte.
- **Status:** "atrasado" é calculado (`pending` com data passada), nunca gravado. Em pendente, `date` é o vencimento.
- **Cartão é uma conta com `type: 'card'`.** Pagamento de fatura é `transfer` da conta pagadora para o cartão.
- **Aporte/resgate de meta** é `transfer` com `goalId`. O destino depende da decisão pendente nº 2.
- **Entrou / saiu:** só lançamentos `paid` do mês. Compra no cartão conta pela data da compra. Pendentes aparecem à parte, como "a pagar".
- **Recorrente:** gera ocorrências só depois de `generatedThrough`, então excluir uma ocorrência não a recria.
- **Campos v1 sem lugar no v2** vão para `transaction.legacy` ou para a tabela `archive`, que estão sempre incluídos no backup.

## Migração e backup

- Uma função pura, `migrateV1toV2(backupV1)`, é usada tanto para importar um backup v1 quanto no upgrade do Dexie.
- Nada é gravado se alguma invariante falhar:
  - saldo de cada conta;
  - acumulado de cada meta;
  - total em aberto de cada fatura;
  - contagem de lançamentos não excluídos;
  - despesas pagas por mês e categoria.
- O import aceita backup v1 **para sempre**. O export gera a versão atual.
- Trocar de hospedagem muda a origem, e o IndexedDB não vai junto: a ponte é sempre o backup JSON.
- Nunca commite backup com dados reais. Fixtures de teste usam dados fictícios ou anonimizados, sem descrições reais.

## Convenções

- Interface e textos em pt-BR. Moeda via `Intl.NumberFormat('pt-BR', { currency: 'BRL' })`, datas dd/mm/aaaa.
- Cada fase do plano termina com build verde, testes passando e o app deployável e usável.
- Regras de domínio (saldos, faturas, recorrentes, migração) são funções puras com teste unitário.
- Não adicione dependências sem necessidade clara. O plano remove `recharts` e `jspdf`.
- Comandos (a partir da F0): `pnpm install`, `pnpm check`, `pnpm build`, `pnpm test`.
