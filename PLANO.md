# Bolso Claro — plano de simplificação

Status: **aprovado em 24/10/2026.** As 7 decisões da seção 6 foram respondidas em 24/10/2026 (ver tabela).
Base: commit `5f32ca2` deste repositório + HTML e JS do app publicado em `bolsocal-f6mmdgnc.manus.space`, conferidos em 24/10/2026.

---

## 0. Resumo em 6 linhas

1. O código no repositório já tem editar/excluir meta, e o saldo da meta já é calculado a partir dos lançamentos. Os dois bugs que você citou estão corrigidos no código e no bundle publicado. Encontrei outros bugs de sincronização, ainda abertos (seção 1.5).
2. **O código não tem telemetria, mas a hospedagem tem.** O `manus.space` injeta `plausible.io` e `manus-analytics.com` em toda página servida. Para cumprir o princípio 5, o app precisa sair do manus.space.
3. Sair do manus.space muda a origem. O IndexedDB pertence à origem, então **os dados não vão junto sozinhos**. A migração passa obrigatoriamente pelo backup JSON, que já existe e funciona.
4. O repositório não compila como está: é um upload plano de arquivos, e os imports apontam para `src/db`, `src/domain`, etc. Ele também carrega uns 15 arquivos de lixo do Manus.
5. Proposta: 4 telas, 4 tipos de lançamento em vez de 8, 7 tabelas em vez de 16, cartão vira um tipo de conta, dívida vira recorrente com parcelas, e sai o `recharts`.
6. Execução em 7 fases pequenas. A primeira só arruma o build e troca a hospedagem, sem mudar comportamento.

---

## 1. Auditoria do código atual

### 1.1 Estrutura

O repositório é um upload plano de 46 arquivos. Pelos imports, a árvore original era esta:

```
src/
  main.tsx, App.tsx, styles.css, types.ts
  db/        index.ts (Dexie), operations.ts (geração de recorrentes, lixeira, migração legada)
  domain/    finance.ts (saldos, faturas, totais), recurring.ts (ocorrências, insights)
  lib/       format.ts, backup.ts, importers.ts (CSV/OFX)
  components/FormModal.tsx
  features/  Views.tsx (16 telas), ImportDialog.tsx, TrashView.tsx
public/icons/  favicon.svg, icon-192.png, icon-512.png (não está no repositório)
```

Arquivos que não são do app e podem sair: `SKILL.md` (manus-config), `README.md` (template Expo), `configuration.md`, `build-contracts.md`, `dependency-setup.md`, `git-checkpoints.md`, `pwa.md`, `output.txt`, `2026-10-19_*.txt`, `patch_app_linked.py`, `replace_views_goals.py`, `restore_views_modules.py`, `unify_debt_payment.py`, `postinstall.js` (banner do core-js), `manus-routes.json`, `app.config.ts` (logo no CDN do Manus) e `pasted_content.txt`. Este último é o escopo original; vale guardar em `docs/` como histórico. Também não há lockfile, o que deixa o build não reprodutível.

### 1.2 Tamanho e forma dos componentes

| Arquivo | Tamanho | Problema |
|---|---|---|
| `Views.tsx` | 68 KB em 234 linhas | 16 telas num arquivo só, com linhas de 300 a 500 caracteres. O Dashboard sozinho calcula 12 conjuntos de dados a cada render. |
| `FormModal.tsx` | 37 KB | 13 formulários num componente, com uns 60 `useState` compartilhados. O mesmo state `limit` serve de limite do cartão, aporte automático e parcela da dívida; `goalKind` serve de tipo da meta e de aporte/resgate. |
| `App.tsx` | 25 KB | 16 `useLiveQuery` que carregam **todas as tabelas inteiras** e cerca de 40 handlers. O PDF é montado inline. |

O dashboard tem 19 blocos: banner, 4 stat cards, 3 cards de resumo, rosca, barras, tendência de 12 meses, projeção de 12 meses, leituras, próximos 7 dias, patrimônio, forma de pagamento, médias 3/6 meses, recentes e 4 atalhos.

### 1.3 Modelo de dados (Dexie, banco `BolsoClaro`, versão 1)

16 tabelas: `accounts`, `cards`, `transactions`, `categories`, `budgets`, `recurring`, `debts`, `goals`, `goalMovements` (legada, esvaziada no boot), `receivables`, `planned`, `rules`, `filters`, `snapshots`, `trash`, `settings`.

`Transaction` tem 27 campos e 8 `kind`s: `income`, `expense`, `reimbursement`, `transfer`, `adjustment`, `goalContribution`, `goalWithdrawal`, `cardPayment`.

**O que está bem e deve ficar:** valores em centavos inteiros. Saldo de conta, fatura, saldo de meta e estado da dívida são *derivados* dos lançamentos, não somados num campo à parte. É o desenho certo e a nova versão mantém.

### 1.4 Dependências

`react 18`, `dexie 4` + `dexie-react-hooks`, `vite-plugin-pwa`, `papaparse`, `lucide-react`, `recharts`, `jspdf` (carregado só ao gerar PDF). O JS principal publicado tem **846 KB**, e o `recharts` deve ser a maior parte dele (estimativa; a F6 mede). `vite` e `@vitejs/plugin-react` estão em `dependencies` quando deveriam estar em `devDependencies`. Não há testes.

**Terceiros em produção:** o HTML publicado inclui `<script src="https://plausible.io/js/script...">` e `<script src="https://manus-analytics.com/script.js" data-website-id=...>`. Os dois são injetados pela hospedagem e não aparecem no código, então só saem trocando de host.

### 1.5 Bugs: onde estão

| # | Sintoma | Causa (arquivo:linha no upload plano) | Estado |
|---|---|---|---|
| B1 | Meta sem editar/excluir | Já implementado: `Views.tsx` (Goals) + `App.tsx` `onEditGoal`/`onDeleteGoal`. O bundle publicado contém "Editar meta" e "Excluir meta". | Corrigido no código. Se você não vê os botões, o app instalado está preso num service worker antigo. Ver decisão 7. |
| B2 | Aporte não acompanha a exclusão do lançamento | `goalBalanceCents` (`finance.ts:42`) deriva o saldo da meta dos lançamentos e ignora os excluídos: excluir o aporte zera, restaurar volta. | Corrigido no código. Restam 3 caminhos parecidos, B2a a B2c. |
| B2a | O saldo total cai a cada aporte, mas "Saídas" não sobe | `accountBalances` debita `goalContribution` da conta de origem e não credita nenhuma (`finance.ts:86`), enquanto `monthTotals` só conta `expense` como saída. | **Corrigido na F1.** `goals.accountId` é a conta onde o dinheiro da meta fica (decisão 2). Aporte/resgate novo grava `goalAccountId` no lançamento, e `accountBalances` credita (aporte) ou debita (resgate) essa conta: o saldo total não cai e "saiu" não muda. Meta sem conta, e movimentos gravados antes da F1, mantêm o comportamento antigo, para não mudar saldos existentes. Aporte automático de meta com conta sai da primeira outra conta ativa. Testes: `goals.test.ts`, `finance.test.ts`. |
| B2b | Editar um aporte pode convertê-lo em despesa | O select "Tipo" do formulário (`FormModal.tsx:169`) não tem opção para aporte e mostra "Despesa". Mexer nele troca o `kind`, e o aporte some da meta. | **Corrigido na F1.** Editar aporte/resgate abre o formulário "Movimentar meta" (`editFormFor`), que mantém o tipo, a meta e o status. O select "Tipo" do lançamento mostra Aporte/Resgate e fica travado se receber um. Teste: `goals.test.ts`. |
| B2c | Aportes antigos podem ter sumido na migração | `migrateLegacyLedgers` casa `goalMovements` com lançamentos por heurística e usa o primeiro candidato como último recurso (`operations.ts:18`). Depois apaga a tabela original (`:33`). Um casamento errado faz o aporte não ser recriado. | Irrecuperável sem backup anterior. Só é possível verificar: `pnpm verifica-aportes caminho/do/backup.json` lista, por meta, cada aporte/resgate (data, valor, conta) e o acumulado, e aponta despesas com cara de aporte (possível B2b). Só lê o arquivo. |
| B3 | Recorrente ou parcela de dívida excluída volta na próxima abertura | `generateCurrentObligations` monta o conjunto de ocorrências existentes **ignorando os excluídos** (`operations.ts:41`). O campo `lastGeneratedFor` existe no tipo e nunca é usado. O mesmo acontece depois que a lixeira expurga, em 30 dias. | **Corrigido na F1.** `planObligations` (`recurring.ts`, pura) só gera datas depois de `generatedThrough` de cada recorrente, dívida e aporte automático, e avança o marcador até o fim do mês. `lastGeneratedFor` saiu do tipo (o índice fica até a versão 2 do Dexie). Dado sem marcador parte da última ocorrência conhecida, inclusive excluídas. Teste: `recurring.test.ts`. |
| B4 | "Saídas" conta conta que você ainda não pagou | `monthTotals` não filtra status (`finance.ts:100`). Como os recorrentes são gerados até o fim do mês, no dia 1 o aluguel já aparece como saída. | **Corrigido na F1.** "Entrou" e "saiu" contam só `paid`; compra no cartão conta pela data da compra. Pendentes viram `pendingCents` ("A pagar") e `pendingIncomeCents` ("a receber", abaixo de Entradas). Teste: `finance.test.ts`. |
| B5 | "Atrasado" quase nunca aparece | O status é gravado uma vez, na geração (`operations.ts:48`, `:58`). Um pendente que vence depois continua "Pendente" para sempre. | **Corrigido na F1.** `isOverdue` (pendente com vencimento antes de hoje) é calculado na lista e no filtro. A geração e o formulário gravam só `paid`/`pending`; `overdue` de dados antigos é lido como pendente. Teste: `finance.test.ts`. |
| B6 | Mesmo padrão de B1 em outras entidades | Recorrente: só pausar. Dívida: só registrar parcela. Conta e cartão: só arquivar. Orçamento: sem excluir. | Aberto |
| B7 | "Primeiro dia do mês" não faz nada | `monthStartDay` é salvo e nunca lido (`index.ts:55`). | Resolvido por remoção (decisão 4): a configuração sai na F6. |
| B8 | "Despesas líquidas" em Lançamentos soma transferências e ajustes | O resumo da lista trata tudo que não é `income` como despesa (`Views.tsx`, componente Transactions). | Aberto. Some com a tela nova. |

---

## 2. Mapa de funcionalidades

Legenda: **manter** · **fundir em X** · **cortar** (sai sem volta prevista) · **v2** (sai agora, pode voltar). Nada é apagado dos dados: o que sai da interface vai para uma tabela `archive` (seção 3) e continua no backup.

### Núcleo

| Funcionalidade | Decisão | Por quê |
|---|---|---|
| Lançamento receita/despesa | **manter** | É o app. Fica valor + categoria + descrição; o resto vai para "mais opções". |
| Data, conta | **manter**, escondidos | O padrão é hoje e a última conta usada, então quase nunca é preciso tocar. |
| Status pago/pendente | **manter** | Os recorrentes dependem dele. "Atrasado" passa a ser calculado (data passada + pendente), não gravado. Isso resolve B5. |
| Data de vencimento | **fundir em data** | Duas datas no mesmo lançamento confundem. Em pendente, a data *é* o vencimento. |
| Transferência e ajuste de saldo | **manter**, em "mais opções" | Sem elas os saldos ficam errados. Uso raro, mas necessário. |
| Parcelamento | **manter**, em "mais opções" | Compra parcelada no cartão é rotina. O código já funciona. |
| Contas | **manter** | Só nome, saldo inicial e "entra no total". Saem tipo, ícone e cor manual. |
| Cartões | **fundir em Contas** (conta do tipo cartão) | Um seletor só no formulário. O pagamento da fatura vira transferência conta → cartão, e o `kind` `cardPayment` sai. |
| Faturas | **manter**, simplificado | Fatura atual e próxima, com "pagar". O pagamento parcial continua. |
| Orçamento por categoria | **manter**, como valor fixo que vale até você mudar | Acaba o ritual de "copiar mês anterior". Um orçamento por categoria, sem mês. |
| "Quanto falta" e ritmo diário | **manter** | É a pergunta 3 do Início. |
| Recorrentes (fixos) | **manter** | Mensal e anual no formulário (anual cobre IPVA e IPTU). Geração corrigida (B3). |
| Dívidas | **fundir em Recorrentes** ("parcelado: N de M") | Concordo com você. Parcela fixa com fim é um recorrente com data final. Saem juros e amortização; o estado atual de cada dívida vira "faltam K parcelas". |
| Metas | **manter**, simplificado | Nome, alvo, prazo opcional, conta onde o dinheiro fica, acumulado e "R$ X/mês até o prazo". Saem tipo, prioridade, ícone, aporte automático e o simulador por meta. |
| Categorias | **manter** | Editar nome, cor e arquivar. |
| Subcategorias | **cortar** | Na prática, a descrição já cumpre esse papel. O texto da subcategoria é anexado à descrição na migração. |
| Import CSV/OFX | **manter** | O OFX já funciona e usa o mesmo diálogo, sem custo extra de interface. |
| Export CSV e backup JSON | **manter** | Backup é a única rede de segurança de um app sem servidor. O lembrete de 30 dias fica. |
| PWA offline | **manter** | |

### Seus candidatos a corte

| Funcionalidade | Decisão | Por quê |
|---|---|---|
| Regras de categorização | **fundir no import** | Sem tela de regras. Ao importar, a categoria é sugerida pela última usada com a mesma descrição. Mesmo efeito, zero interface. |
| Tags | **cortar** | Não aparecem em nenhum total. A busca por texto cobre o resto. |
| Filtros salvos | **cortar** | Na tela nova, os filtros são mês, busca, categoria, conta e "a pagar". |
| Divisão / reembolso / "A receber" | **v2** | Fluxo raro e com regras próprias de total. Pendências abertas viram lançamentos pendentes (decisão 6). |
| Comprovante anexado | **v2** | Incha o IndexedDB e o backup, que guarda o arquivo em base64. Os anexos existentes ficam guardados, não visíveis (decisão 6). |
| Snapshots de patrimônio | **cortar** | Dá para recalcular dos lançamentos se um dia voltar. |
| Simulador "e se" e projeção de 12 meses | **v2** | "Pode gastar até o fim do mês" cobre o horizonte que você usa toda semana. |
| Calendário | **cortar** | Concordo: duplica "a pagar" em Lançamentos. |
| Lixeira de 30 dias | **fundir em "Desfazer"** | Discordo em parte. Excluir sem volta no celular é arriscado. Troco a lixeira por um aviso "Excluído · Desfazer" de alguns segundos, removo o deslizar-para-excluir e mantenho a confirmação para itens com parcelas. |
| Forma de pagamento, médias 3/6m, "Leituras do mês" | **cortar** | O ⚠ de "categoria acima do limite" no Início substitui a única leitura que pede ação. |
| Resumo em PDF | **cortar** | O CSV abre em qualquer planilha. Sai o `jspdf`. |

### Que você não listou, mas eu cortaria

| Funcionalidade | Decisão | Por quê |
|---|---|---|
| Gráficos (rosca, barras, tendência, patrimônio, projeção) | **cortar** (v2 para tendência) | A tela Orçamento já mostra gasto × limite por categoria. Os outros gráficos não respondem às 3 perguntas. Sai o `recharts`, que é a maior parte do bundle. |
| Gastos planejados | **fundir em lançamento pendente** | "IPVA em março" é um lançamento pendente em março. |
| Notificações | **cortar** | Só funcionam com o app aberto, e o próprio app avisa isso. |
| Deslizar para pagar/excluir | **cortar** | Exclusão acidental. Tocar no item abre a edição, com Pagar e Excluir. |
| Indicador online/offline | **cortar** | Os dados são locais, então ele não informa nada útil. |
| Tema claro/escuro (configuração) | **fundir no sistema** | Segue o modo do celular. O CSS já existe. |
| Modo privacidade (olho) | **manter** | É um botão e um booleano, com uso típico em público. Custo quase zero. |
| Ctrl+N no desktop | **manter** | Custo zero. |

---

## 3. Novo modelo de dados

### 3.1 Tabelas (Dexie versão 2)

```ts
// 7 tabelas. Era 16.
accounts:     { id, name, type: 'account' | 'card', initialBalanceCents, includeInTotal, archived, createdAt,
                // só cartão:
                limitCents?, closingDay?, dueDay?, payFromAccountId? }

transactions: { id, kind: 'income' | 'expense' | 'transfer' | 'adjustment',
                amountCents, date,               // date = vencimento quando pendente
                status: 'paid' | 'pending',      // "atrasado" é calculado
                description, categoryId?, accountId, toAccountId?,   // toAccountId só em transfer
                recurringId?, installment?: { seriesId, index, count },
                invoiceMonth?, goalId?,          // goalId marca aporte/resgate
                createdAt, updatedAt, legacy?: object }   // campos antigos, intocados

categories:   { id, name, kind: 'income' | 'expense', color, archived }
budgets:      { categoryId (chave), amountCents }              // vale até mudar
recurring:    { id, name, kind: 'income' | 'expense', amountCents, variable, categoryId, accountId,
                frequency, dayOfMonth, startDate, endDate?, active, generatedThrough? }  // generatedThrough corrige B3
goals:        { id, name, targetCents, deadline?, accountId, archived, createdAt }   // accountId obrigatório: conta onde o dinheiro da meta fica (decisão 2)
settings:     { id: 'app', privacyMode, lastBackupAt?, defaultAccountId? }   // monthStartDay saiu (decisão 4: mês começa no dia 1)
archive:      { id: '<tabela antiga>', rows: unknown[] }   // receivables, planned, rules, filters,
                                                          // snapshots, trash, debts originais, anexos
```

Regras derivadas:

- **Saldo de conta:** saldo inicial + receitas − despesas ± transferências + ajustes, só com `paid`. Em conta-cartão, o resultado é a dívida do cartão.
- **Fatura:** despesas da conta-cartão agrupadas por `invoiceMonth` − transferências recebidas naquele mês. O cálculo é o de hoje.
- **Acumulado da meta:** soma dos lançamentos com `goalId`, entradas − saídas. Continua derivado, como hoje. Aporte novo é `transfer` da conta de origem para `goals.accountId`: o saldo total não cai e "saiu" não muda (decisão 2, fecha B2a).
- **Recorrente:** gera ocorrências só a partir de `generatedThrough` e avança esse marcador. Excluir uma ocorrência não a ressuscita (B3).
- **Entrou / saiu do mês:** soma de `income`/`expense` **pagos** no mês. Compras no cartão contam pela data da compra, como hoje e coerente com o orçamento. Pendentes viram uma linha à parte, "a pagar" (B4).

### 3.2 Como cada coisa antiga vira nova

| v1 | v2 |
|---|---|
| `cards` | `accounts` com `type: 'card'` (mesmo `id`) |
| tx com `cardId` | `accountId = cardId` |
| `cardPayment` | `transfer` da conta pagadora → conta-cartão, mantendo `invoiceMonth` |
| `reimbursement` | `income` na categoria Reembolso (decisão 6) |
| `goalContribution` / `goalWithdrawal` | `transfer` com `goalId`. Na migração fica **sem `toAccountId`**, para preservar exatamente o saldo de hoje (B2a); o relatório de migração informa quantos aportes antigos ficaram sem conta de destino. Aportes novos seguem a decisão 2: `transfer` com `toAccountId = goals.accountId`. |
| `status: 'overdue'` | `pending` |
| `dueDate` de pendente | vira `date` |
| `subcategory`, `tags`, `notes`, `paymentMethod`, `paidAt`, `attachment` | `legacy` dentro do próprio lançamento. A subcategoria também é anexada à descrição. |
| `debts` | `recurring` com `endDate` = vencimento da última parcela restante. Original vai para `archive`. Lançamentos `recurrenceId: debt:X` → `recurringId: X`. |
| `budgets` por mês | valor do mês mais recente de cada categoria. Histórico vai para `archive`. |
| `planned` não convertidos | `expense` pendente no dia 1 do mês previsto |
| `receivables` abertos | `income` pendente "A receber · pessoa". Originais vão para `archive`. |
| `trash`, `rules`, `filters`, `snapshots`, `goalMovements` | `archive` |
| lançamentos com `deletedAt` | removidos de `transactions`, cópia em `archive.trash` |

### 3.3 Plano de migração sem perda

**Por que não basta uma migração no próprio banco:** o app precisa sair do manus.space (seção 1.4), e o IndexedDB do novo endereço começa vazio. A ponte é o backup JSON. O botão "Baixar backup JSON" já existe e exporta todas as 16 tabelas, inclusive anexos.

1. **Uma função pura, `migrateV1toV2(backupV1) → { dataV2, report }`.** Ela é usada nos dois caminhos: restaurar um backup v1 no app novo, e atualizar no lugar (Dexie `version(2).upgrade`) se algum dia o app rodar com dados v1 na mesma origem.
2. **Invariantes verificadas antes de gravar.** Se alguma falhar, nada é gravado e o app mostra o relatório:
   - saldo de cada conta antes = depois;
   - acumulado de cada meta antes = depois;
   - total em aberto de cada fatura antes = depois;
   - quantidade de lançamentos não excluídos antes = depois;
   - total de despesas *pagas* por mês e categoria antes = depois (as pendentes mudam de propósito por causa de B4).
3. **Testes automatizados** com o backup de teste que já está no repositório e com uma cópia anonimizada do seu backup real. A anonimização roda no seu navegador; eu só recebo valores e IDs, nunca descrições.
4. **Passo a passo para você:**
   1. No app antigo, *de dentro do app instalado* (no iPhone, o app da tela inicial tem armazenamento separado do Safari), vá em Mais → Configurações → Baixar backup JSON. Guarde o arquivo em dois lugares.
   2. No app novo, vá em Ajustes → Importar backup. A tela mostra o relatório: "312 lançamentos, 3 contas, saldos conferem ✓". Você confirma.
   3. Use os dois em paralelo por uma semana. O app antigo não é apagado.
   4. Depois, apague os dados do site antigo e remova o atalho.
5. **Saída de emergência:** o app novo exporta backup v2 e continua aceitando v1 para sempre. A tabela `archive` e o campo `legacy` vão no backup, então dá para reconstruir qualquer funcionalidade cortada.

---

## 4. Wireframes

Celular, 360×740. Tudo no Início cabe sem rolar.

### Início

```
┌──────────────────────────────────────┐
│ Bolso Claro         ‹ outubro ›   👁 │
├──────────────────────────────────────┤
│  PODE GASTAR ATÉ 31/10               │
│  R$ 1.240,00                         │
│  R$ 155 por dia · faltam 8 dias      │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░  71% do orçamento │
├──────────────────┬───────────────────┤
│ ENTROU           │ SAIU              │
│ R$ 6.500,00      │ R$ 4.120,00       │
│                  │ + R$ 980 a pagar ›│
├──────────────────┴───────────────────┤
│ ⚠ Restaurantes passou R$ 60 do limite›│  ← só aparece se houver
├──────────────────────────────────────┤
│ Últimos                              │
│ Mercado        Alimentação   −84,20  │
│ Uber           Transporte    −23,90  │
│ Salário        Salário    +6.500,00  │
├──────────────────────────────────────┤
│  Início   Lançamentos  Orçamento  Ajustes   (+) │
└──────────────────────────────────────┘
```

"a pagar ›" leva a Lançamentos com o filtro "A pagar". A lista de pendências só existe lá (princípio 3).

### Lançamentos

```
┌──────────────────────────────────────┐
│ Lançamentos         ‹ outubro ›   🔍 │
│ [Todos] [A pagar 3] [Itaú] [Nubank]  │
├──────────────────────────────────────┤
│ A PAGAR                              │
│ 20/10 Internet            120,00 [✓] │
│ 25/10 Empréstimo 8/24     450,00 [✓] │
│ 10/11 Fatura Nubank     1.230,00 [✓] │  ← fatura entra como item a pagar
├──────────────────────────────────────┤
│ QUI, 23                              │
│ Mercado · Alimentação · Itaú  −84,20 │
│ Uber · Transporte · Nubank    −23,90 │
│ QUA, 22                              │
│ ...                                  │
├──────────────────────────────────────┤
│ 47 lançamentos · [Exportar CSV]      │
└──────────────────────────────────────┘
```

Tocar num item abre a edição, com os botões Pagar, Excluir e Salvar. "Desfazer" aparece por alguns segundos depois de excluir.

### Orçamento

```
┌──────────────────────────────────────┐
│ Orçamento           ‹ outubro ›      │
│ R$ 3.010 de R$ 4.250 · sobra R$ 1.240│
├──────────────────────────────────────┤
│ Alimentação   620 / 900   ▓▓▓▓▓▓░░░  │
│               faltam 280 · 35/dia    │
│ Restaurantes  410 / 350   ▓▓▓▓▓▓▓▓▓! │
│               60 acima               │
│ Transporte    180 / 300   ▓▓▓▓▓░░░░  │
│ Moradia     1.800 / 1.800 ▓▓▓▓▓▓▓▓▓  │
│ …                                    │
│ Sem limite: Lazer 120 · Pets 80  [+] │
├──────────────────────────────────────┤
│ METAS                                │
│ Viagem   2.300 / 6.000  ▓▓▓▓░░░░░░  │
│          R$ 740/mês até mar/27 [Aportar] │
│ Reserva  8.000 / 15.000              │
└──────────────────────────────────────┘
```

Tocar numa categoria abre "editar limite" e lista os lançamentos dela no mês.

### Ajustes

```
┌──────────────────────────────────────┐
│ Ajustes                              │
├──────────────────────────────────────┤
│ CONTAS E CARTÕES                     │
│ Itaú                    R$ 2.340,10  │
│ Poupança                R$ 8.000,00  │
│ Nubank (cartão)  1.230 de 5.000 usado│
│ [+ Conta]  [+ Cartão]                │
├──────────────────────────────────────┤
│ Fixos (recorrentes) · 6 · R$ 3.120/mês ›│
│ Categorias                         › │
├──────────────────────────────────────┤
│ DADOS (só neste aparelho)            │
│ Fazer backup     último: 12/10    ⚠  │
│ Restaurar backup                     │
│ Importar extrato (CSV/OFX)           │
├──────────────────────────────────────┤
│ Ocultar valores                  [ ] │
└──────────────────────────────────────┘
```

### Formulário rápido (botão +)

```
┌──────────────────────────────────────┐
│ Novo gasto           [Gasto|Entrada] │
│                                      │
│      R$ 0,00 ▌      ← foco + teclado numérico │
│                                      │
│ [Mercado][Restaur.][Transp.][Casa]   │  ← 8 categorias mais usadas
│ [Saúde][Lazer][Assin.][Outras ▾]     │
│                                      │
│ Descrição (opcional) [             ] │
│                                      │
│ Hoje · Itaú                 + opções │
│ [            Salvar               ]  │
└──────────────────────────────────────┘
```

O caminho comum tem 4 toques: **+**, valor, chip da categoria, Salvar. O Enter do teclado também salva.
"+ opções" abre data, conta/cartão, parcelas, pendente, transferência e aporte em meta.

Os valores nos wireframes são ilustrativos.

---

## 5. Execução em fases

Cada fase termina com `pnpm build` verde, testes passando, deploy e o app usável.

| Fase | O que entra | Pronto quando |
|---|---|---|
| **F0. Repositório e hospedagem** | Recriar `src/`, remover o lixo do Manus, lockfile, `icon-512.png`, deps no lugar certo, Vitest. Deploy no **GitHub Pages** via Actions (`.github/workflows/deploy.yml`; `base: '/bolso-claro/'` no Vite) **sem mudar comportamento** (decisão 3). | O app novo abre igual ao antigo, sem nenhum script de terceiros no HTML, e aceita importar seu backup atual. |
| **F1. Bugs no modelo atual + mudança de casa** | B3 (geração usa `generatedThrough`), B4 (saiu = só pago), B5 (atrasado calculado), B2b (aporte editado no formulário certo), B2a (aporte vira transferência para a conta da meta, decisão 2). Testes de domínio para saldos, faturas, recorrentes e metas. Verificação de B2c no seu backup. | Você exporta do manus.space (no iPhone, de dentro do app instalado, decisão 5), importa no GitHub Pages e passa a usar o novo. O antigo fica de reserva. |
| **F2. Cortes de interface** | Saem as telas Calendário, Planejamento, Dívidas (só a tela), A receber, Regras, Lixeira (vira Desfazer), filtros salvos, PDF, notificações e os gráficos do Início. **Dados intocados.** | Menu com 4 itens e app mais leve, sem `jspdf`. Reverter é um `git revert`. |
| **F3. Migração de dados v1 → v2** | `migrateV1toV2` + invariantes + relatório. Dexie v2, backup v2, restaurar aceita v1/v2. Telas restantes adaptadas ao modelo novo. Backup automático antes de migrar. | Seu backup real migra com todas as invariantes ✓ nos testes e no aparelho. |
| **F4. Início + formulário rápido** | As 3 perguntas, ⚠ de orçamento, últimos lançamentos. Formulário em painel inferior com chips por frequência de uso. | Registrar gasto em menos de 10 s no celular, medido. |
| **F5. Lançamentos + Orçamento + Metas** | Lista agrupada por dia com "A pagar" no topo e fatura como item. Orçamento fixo por categoria. Metas no Orçamento. Recorrentes com parcelas, que absorvem as dívidas. | Revisão semanal no desktop sem sair dessas duas telas. |
| **F6. Ajustes + limpeza** | Contas e cartões unificados, categorias, dados, preferências (sem "mês começa no dia"). Sai o `recharts`. Teste de PWA offline com Playwright. Apagar os dados do app antigo. | Bundle principal bem menor que 846 KB, Lighthouse PWA ok, funciona em modo avião. |

---

## 6. Decisões pendentes

Cada item indica a fase que ele bloqueava. Todas respondidas em 24/10/2026; os ajustes decorrentes já estão aplicados nas seções 1.5, 2, 3, 4 e 5.

| # | Decisão | Bloqueia | Recomendação | Resposta |
|---|---|---|---|---|
| 1 | Definição de "pode gastar" | F4 | (A) orçamento | **(A) Orçamento** — soma dos limites − gasto nas categorias com limite. Fixos precisam ter limite na categoria. |
| 2 | Onde fica o dinheiro das metas | F1 (B2a), F3 | depende do uso | **(a) Conta separada** — aporte = `transfer` conta → conta da meta (`goals.accountId` obrigatório). Saldo total não cai; "saiu" não muda. |
| 3 | Hospedagem nova | F0 | Cloudflare Pages | **GitHub Pages** — repo é público; deploy via Actions. Se o repo virar privado, migra para Cloudflare Pages. |
| 4 | Dia de início do mês | F4 | — | **Dia 1** — a configuração `monthStartDay` sai. B7 resolvido por remoção. |
| 5 | Android ou iPhone | F1 (instruções de exportação) | — | **iPhone** — backup deve ser baixado de dentro do app instalado (IndexedDB separado do Safari). |
| 6 | Reembolsos e comprovantes nos dados reais | F3 | arquivar, invisível na v1 | **Arquivar, invisível na v1** — pendências de reembolso viram `income` pendente; anexos ficam em `legacy`/`archive`. |
| 7 | Botões de editar/excluir meta aparecem no app instalado | F1 | — | **Aparecem e o aporte funciona** — B1 e B2 fechados. F1 fica com B2a, B2b, B2c. |

Detalhes de cada pergunta (mantidos como histórico):

1. **"Pode gastar até o fim do mês" significa o quê?**
   - **(A) Orçamento:** soma dos limites − gasto nas categorias com limite. *Recomendo*, porque usa o orçamento que você já quer manter e o ritmo diário sai natural. Exige que os fixos (aluguel etc.) tenham limite na categoria deles.
   - **(B) Caixa:** entradas do mês (recebidas + previstas) − saídas (pagas + a pagar + fatura). Funciona sem orçamento, mas ignora seus limites.
2. **Onde fica o dinheiro das metas?**
   - **(a) Numa conta separada (poupança, investimento):** o aporte vira transferência para essa conta. O saldo total não cai e "saiu" não muda.
   - **(b) Na mesma conta, só "separado na cabeça":** o aporte não move dinheiro, só reduz o "pode gastar".
   Hoje o app faz uma terceira coisa: o dinheiro sai da conta e não entra em lugar nenhum. É o B2a.
3. **Hospedagem nova.** Recomendo **Cloudflare Pages**: grátis, funciona com repositório privado e não injeta nada. GitHub Pages também serve, mas com repositório privado exige plano pago. Tem preferência, ou um domínio próprio?
4. **Seu mês começa no dia 1 ou no dia do salário?** Se for outro dia, implemento de verdade, porque muda o "até o fim do mês". Se for dia 1, a configuração sai.
5. **Seu celular é Android ou iPhone?** Muda as instruções de exportação e o cuidado com o armazenamento. No iPhone, o app instalado tem dados separados do Safari.
6. **Nos seus dados reais, você usou divisão/reembolso ou anexou comprovantes?** Se sim, eles ficam preservados no backup mas invisíveis na v1. Pendências de reembolso viram lançamentos pendentes. Está ok, ou algum desses precisa continuar visível?
7. **No app que você usa hoje, os botões de editar e excluir aparecem no card da meta?** Se não aparecem, é o service worker servindo versão antiga, e a F0 resolve. Se aparecem e o bug do aporte continua, me diga os passos (criar meta → aportar R$ X → excluir onde?). Pode ser B2b ou B2c.
