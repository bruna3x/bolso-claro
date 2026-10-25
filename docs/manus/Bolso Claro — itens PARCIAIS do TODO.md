# Bolso Claro — itens PARCIAIS do TODO

Estado após as correções e os testes de 19/10/2026. A checklist completa, com as caixas e cláusulas integrais, está em [TODO.md](/home/ubuntu/bolsocal/TODO.md). Esta lista conserva o título ou início literal de cada um dos 24 bullets PARCIAIS e descreve o que falta.

## 1. **Contas e cartões**
Falta escolher e editar o ícone de cada conta. Hoje o formulário grava um ícone fixo e a tela usa um ícone genérico. Os demais campos de conta e cartão estão cobertos.

## 2. **Faturas**
O limite disponível é mostrado no resumo do cartão, mas não junto de cada fatura. A separação por fechamento, a lista de compras com descrição/data/valor, os índices das parcelas e o status “Fechada” após o dia de fechamento foram corrigidos e aparecem no app.

## 3. **Transferências e ajuste de saldo**
Os totais financeiros do dashboard não contam transferências como receita/despesa. Porém, o resumo de “despesas líquidas” na tela de Lançamentos ainda inclui transferências e ajustes; esse agregado precisa excluí-los também.

## 4. **Parcelamentos**
Não há ação para antecipar ou quitar várias parcelas de uma vez. “Editar as restantes” propaga apenas valor, descrição, categoria, conta e status; não propaga forma de pagamento, tags, observações, vencimento e comprovante.

## 5. **Lançamentos recorrentes**
O cadastro não oferece forma de pagamento nem cartão. As ocorrências são geradas ao abrir o app, até o fim do mês corrente, sem geração em segundo plano nem pré-geração de meses futuros. A ocorrência variável pode ser marcada como paga sem exigir confirmação explícita do valor real. O alerta compara os últimos seis lançamentos pagos, não a média dos seis meses-calendário.

## 6. **Divisão de gastos e reembolsos**
Uma despesa permite cadastrar somente uma pessoa e um valor a receber, não várias pessoas com valores distintos. Os controles de divisão/reembolso aparecem ao criar uma despesa, mas não ao editar uma despesa já existente.

## 7. **Busca e filtros**
Faltam filtros específicos por cartão e por subcategoria. Os demais filtros e a possibilidade de salvar filtros favoritos estão presentes.

## 8. **Categorias**
Falta escolher/editar ícones. Ao salvar a edição, o código grava um ícone fixo (“Ponto”), podendo substituir o ícone anterior.

## 9. **Orçamento mensal**
O orçamento é por categoria; não existe orçamento por subcategoria. Os campos e cálculos da subcategoria precisam ser adicionados ao formulário e às visões do orçamento.

## 10. **Projeção e simulador**
O simulador altera o saldo projetado, mas não calcula o impacto nas metas. O cenário é texto livre, sem categoria associada: um corte em Restaurantes não reduz Restaurantes especificamente, e o mesmo delta é aplicado genericamente ao saldo projetado.

## 11. Cada meta contém nome, ícone, valor-alvo, valor acumulado, barra de progresso em %, prazo, conta vinculada, prioridade e histórico de aportes (data e valor).
Prazo e conta vinculada podem ficar vazios; o ícone é fixo. O histórico de aportes é somado, mas a tela não lista cada aporte com data e valor.

## 12. Calcular quanto guardar por mês para cumprir o prazo e indicar se está no ritmo, adiantada ou atrasada, com quantos meses de atraso; permitir aporte rápido a partir do dashboard, aporte automático recorrente e resgate.
Falta um estado completo por meta (“no ritmo”, “adiantada” ou “atrasada”) com a quantidade de meses de atraso. Não há aporte rápido no dashboard. O aporte automático cria uma obrigação pendente, que ainda precisa ser marcada como paga para virar movimento de meta.

## 13. Tipos: juntar dinheiro, quitar dívida (vinculada ao módulo Dívidas) e reserva de emergência (com sugestão de 6x os gastos fixos mensais).
Uma meta de quitação de dívida não permite escolher a dívida: fica vinculada à primeira da lista. A reserva de emergência não calcula nem sugere seis vezes os gastos fixos mensais.

## 14. Simulador da meta responde “se eu guardar R$ X por mês, quando atinjo?” e “se quero atingir em N meses, quanto preciso por mês?”.
Não há campo para informar arbitrariamente “em N meses” nem resposta calculada para esse prazo. O valor mensal mostrado depende apenas do prazo já salvo na meta.

## 15. **Gráficos**
A comparação mostra valores atual, médias de 3 e 6 meses, mas só a variação percentual contra 3 meses; faltam variações em reais e comparações completas contra 6 meses. Falta gráfico de gastos por cartão. Gastos por forma de pagamento aparecem como texto, não como gráfico. O snapshot patrimonial é criado quando o app abre para registrar o mês anterior, não por uma execução garantida no fechamento do mês.

## 16. **Insights simples**
Falta comparação ano contra ano (por exemplo, alta do plano de saúde). Quando a projeção fica negativa, o app não identifica a despesa causadora nem calcula quanto reservar por mês. O insight de atraso de meta depende do aporte automático configurado e não mede o ritmo real usando aportes manuais já feitos.

## 17. **Calendário e próximos vencimentos**
O calendário não diferencia visualmente pago/pendente/atrasado e ainda oferece “Marcar pago” para itens já pagos. Recorrências, dívidas e aportes não são expandidos diretamente ao navegar para meses futuros; os aportes automáticos usam a data do dia em que são gerados. A lista dos próximos sete dias pode omitir itens: limita-se a quatro transações e duas faturas.

## 18. **Categorização automática**
Depois de categorizar manualmente, o app não sugere automaticamente criar uma regra; é preciso iniciar a criação da regra manualmente. Não há regras iniciais para IFOOD → Restaurantes, UBER → Transporte e UNIMED → Saúde; elas só funcionam depois de cadastradas.

## 19. Tema claro/escuro; modo privacidade com botão de olho que oculta todos os valores e persiste a preferência.
O tema claro/escuro está presente, mas o modo privacidade não cobre o formulário: saldos e valores continuam visíveis em campos e resumos. Prompts de recebimento e confirmação de parcelas também podem mostrar valores mesmo com a privacidade ligada.

## 20. Confirmação antes de excluir; lixeira permite restaurar itens por 30 dias.
Lançamentos usam a lixeira, mas filtros salvos e regras de categorização são excluídos diretamente após confirmação; não podem ser restaurados pela lixeira durante 30 dias.

## 21. Lançamento rápido pelo dashboard (valor + descrição + categoria em 3 toques); atalhos de teclado no desktop e gestos de deslizar no celular para marcar pago/excluir.
O botão do dashboard abre o formulário completo, sem fluxo mínimo que garanta valor + descrição + categoria em três toques. Também faltam atalhos de teclado no desktop e gestos de deslizar no celular para marcar como pago/excluir.

## 22. Configurações de moeda, primeiro dia do mês financeiro (ex.: começar no dia 5, dia do salário), categorias, regras e backup.
Não há seletor de moeda; BRL é fixo. O primeiro dia do mês financeiro é salvo, mas períodos e relatórios continuam seguindo o mês civil. Categorias e regras são acessadas em telas separadas, não integradas à seção de Configurações.

## 23. Todos os dados permanecem no navegador, em IndexedDB, sem backend e sem login; app funciona offline e é instalável como PWA com manifest, service worker e ícone na tela inicial. Tratar indisponibilidade/cota de armazenamento com aviso e orientação para backup; armazenamento não é sincronizado nem ilimitado.
O app usa IndexedDB local, não tem backend/login e possui manifest/service worker/ícones PWA. Falta aviso automático de quota/indisponibilidade de armazenamento e tratamento específico de `QuotaExceededError` com orientação de backup. A falha de `navigator.storage.persist()` não é comunicada ao usuário.

## 24. Código organizado em módulos, com comentários; dados de exemplo são opcionais para testar.
A estrutura modular existe, mas faltam comentários sobre fluxos complexos (notificações, privacidade, projeção, lixeira e operação offline). Dados de exemplo não foram incluídos; eram opcionais no TODO.
