# TODO — Bolso Claro

Resumo da auditoria do código: 10 IMPLEMENTADOS, 24 PARCIAIS e 0 NÃO FEITOS. `[x] [IMPLEMENTADO]` significa que o bullet está completo; `[ ] [PARCIAL]` indica cobertura real com lacunas materiais; `[ ] [NÃO FEITO]` indicaria ausência de implementação útil.

- [x] [IMPLEMENTADO] **Metas e lançamentos vinculados:** cada meta deve poder ser editada (nome, ícone, valor-alvo, prazo, conta vinculada e prioridade), excluída com confirmação para a lixeira e concluída/arquivada. Excluir uma meta deve enviar também seus aportes/resgates à lixeira, e restaurar a meta deve restaurar seus movimentos junto. Aportes e resgates devem ser o mesmo registro de lançamento ou ser vinculados por ID: excluir, editar o valor ou restaurar o lançamento em qualquer lado deve atualizar o outro. O valor acumulado da meta deve ser sempre calculado a partir dos lançamentos de aporte não excluídos, nunca de um campo somado à parte. Aplicar a mesma regra de vínculo e recálculo a resgates e pagamentos de parcelas de dívida. Validar: criar meta, aportar R$ 100, excluir o lançamento e confirmar saldo da meta R$ 0; restaurar da lixeira e confirmar R$ 100; editar o lançamento para R$ 150 e confirmar R$ 150.

## 1. Contas, carteira, cartões, transferências e ajustes

- [ ] [PARCIAL] **Contas e cartões:** cadastrar contas com nome, tipo (conta corrente, poupança, carteira/dinheiro físico, investimento, vale-alimentação/refeição), saldo inicial, cor, ícone e opção “incluir no saldo total”; permitir arquivar conta sem apagar histórico. Cadastrar cartões de crédito com nome, bandeira, limite total, dia de fechamento, dia de vencimento, conta vinculada para pagar fatura e cor.
- [ ] [PARCIAL] **Faturas:** agrupar automaticamente compras conforme período de fechamento (compra após fechamento cai na fatura seguinte); mostrar cada fatura com status aberta/fechada/paga/paga parcialmente, valor total, limite disponível e lista de compras; botão “Pagar fatura” gera saída na conta vinculada e marca fatura como paga; permitir pagamento parcial; mostrar no cartão compromisso futuro (soma das parcelas que ainda vão cair nas próximas faturas).
- [ ] [PARCIAL] **Transferências e ajuste de saldo:** permitir transferência origem → destino sem contabilizar como receita nem despesa nos relatórios; oferecer ajuste de saldo real de uma conta criando um lançamento de ajuste automaticamente.

## 2. Lançamentos, recorrências, dívidas, recebíveis, busca e categorias

- [x] [IMPLEMENTADO] **Receitas e despesas:** registrar tipo (receita/despesa), valor, data, categoria, subcategoria, descrição, conta ou cartão, forma de pagamento (dinheiro, Pix, débito, crédito, boleto, transferência, vale), tags livres, observações, anexo de comprovante (foto ou PDF armazenado localmente, com visualização), status pago/pendente e data de vencimento.
- [ ] [PARCIAL] **Parcelamentos:** informar valor total ou valor da parcela, número de parcelas e data da primeira; gerar todas as parcelas exibindo “3/12”; vincular ao cartão ou conta; permitir editar só uma parcela, editar todas as restantes, antecipar/quitar parcelas e excluir uma ou todas.
- [ ] [PARCIAL] **Lançamentos recorrentes:** cadastrar gastos e receitas fixas com nome, valor, categoria, conta/cartão, forma de pagamento, frequência semanal/quinzenal/mensal/bimestral/trimestral/semestral/anual, dia de vencimento, data de início e fim opcional. Funcionam exemplos: plano de saúde, salário, aluguel, condomínio, internet, celular, energia, água, academia, streaming, seguro do carro, IPVA/IPTU anual e mensalidade de curso. Gerar automaticamente lançamentos pendentes de cada mês; permitir valor variável, confirmando o valor real quando chegar o mês antes de marcar como pago; ter tela “Recorrentes” com tudo, valor mensal total, próximo vencimento, pausar/retomar e histórico; alertar se valor confirmado superar a média dos últimos 6 meses.
- [x] [IMPLEMENTADO] **Dívidas e empréstimos:** módulo para financiamento, empréstimo pessoal, consignado, cheque especial, dívida negociada e dinheiro devido a alguém; registrar credor, valor original, saldo devedor atual, taxa de juros mensal, número de parcelas, parcelas pagas/restantes, valor da parcela, dia de vencimento e data prevista de quitação. Mostrar barra de progresso de quitação, total já pago, total de juros pagos e gerar automaticamente parcela do mês como despesa recorrente. Painel “Dívidas” mostra total devido, comprometimento mensal da renda (%) e ordem sugerida de quitação, escolhida entre maior juros primeiro ou menor saldo primeiro.
- [ ] [PARCIAL] **Divisão de gastos e reembolsos:** em qualquer despesa, permitir marcar “dividida”, informar com quem e quanto cada pessoa deve devolver; criar “a receber” vinculado e, ao receber, lançar entrada e abater. Módulo separado “Reembolsos a receber” para adiantamentos, diárias e despesas de trabalho: lançar gasto, marcar “reembolsável” e acompanhar pendente/recebido com data prevista. Reembolso recebido não infla receitas nos relatórios — deve zerar a despesa original.
- [ ] [PARCIAL] **Busca e filtros:** filtrar lançamentos por período, conta, cartão, categoria, subcategoria, forma de pagamento, tag, status, valor mínimo/máximo e texto da descrição; salvar filtros favoritos.
- [ ] [PARCIAL] **Categorias:** pré-carregar e permitir editar todas as categorias, com subcategorias, cor e ícone. Despesas: Moradia, Alimentação, Restaurantes, Transporte, Saúde, Educação, Lazer, Vestuário, Assinaturas, Pets, Presentes, Impostos, Investimentos, Dívidas, Outros. Receitas: Salário, Extra, Reembolso, Rendimentos, Outros.

## 3. Orçamento, gastos planejados, projeção e simulador

- [ ] [PARCIAL] **Orçamento mensal:** criar orçamento por categoria e, opcionalmente, subcategoria; botão “copiar do mês anterior”; sugestão automática baseada na média dos últimos 3 meses. Por categoria mostrar orçado, gasto, restante, % consumido e ritmo (ex.: “faltam 12 dias e você já usou 90%”); alertas visuais em 80% e 100%; indicador de quanto posso gastar por dia até o fim do mês em cada categoria.
- [x] [IMPLEMENTADO] **Planejamento de gastos futuros:** lançar gastos previstos em qualquer mês à frente (viagem, matrícula, presente, manutenção do carro), com valor estimado; mostrar na projeção e permitir converter em lançamento real quando o mês chegar.
- [ ] [PARCIAL] **Projeção e simulador:** projetar saldo mês a mês por 12 meses considerando saldo atual + recorrentes + parcelas + faturas + dívidas + planejados + aportes de metas, destacando em vermelho os meses com saldo negativo. Disponibilizar simulador “e se” para inserir cortes ou aumentos hipotéticos (ex.: cortar R$ 300 de Restaurantes, receber aumento de R$ 500) e ver impacto na projeção e nas metas sem alterar dados reais.

## 4. Metas financeiras

- [ ] [PARCIAL] Cada meta contém nome, ícone, valor-alvo, valor acumulado, barra de progresso em %, prazo, conta vinculada, prioridade e histórico de aportes (data e valor).
- [ ] [PARCIAL] Calcular quanto guardar por mês para cumprir o prazo e indicar se está no ritmo, adiantada ou atrasada, com quantos meses de atraso; permitir aporte rápido a partir do dashboard, aporte automático recorrente e resgate.
- [ ] [PARCIAL] Tipos: juntar dinheiro, quitar dívida (vinculada ao módulo Dívidas) e reserva de emergência (com sugestão de 6x os gastos fixos mensais).
- [ ] [PARCIAL] Simulador da meta responde “se eu guardar R$ X por mês, quando atinjo?” e “se quero atingir em N meses, quanto preciso por mês?”.

## 5. Dashboard, análises e calendário financeiro

- [x] [IMPLEMENTADO] **Resumo:** seletor de mês; cards Entradas, Saídas, Guardado (aportes em metas), A pagar (pendentes + fatura em aberto + parcelas do mês), Gastos por categoria, saldo total, saldo por conta, limite disponível por cartão e a receber (divisões e reembolsos).
- [ ] [PARCIAL] **Gráficos:** rosca de gastos por categoria; barras de gasto vs. orçamento; tendência mês a mês (receita, despesa, saldo) dos últimos 12 meses; linha de projeção futura do saldo; comparativo “este mês vs. média dos últimos 3 e 6 meses” por categoria mostrando variação em % e R$; patrimônio líquido = soma de contas e investimentos − faturas em aberto − saldo devedor de dívidas, com gráfico de evolução mensal e snapshot automático no fim de cada mês; gastos por forma de pagamento e por cartão.
- [ ] [PARCIAL] **Insights simples:** gerar análises como “Restaurantes está 32% acima do orçamento”, “Você gastou 18% menos com transporte que no mês passado”, “No ritmo atual, a meta Viagem atrasa 2 meses”, “Seu plano de saúde subiu 11% em relação ao ano passado”, “Suas dívidas consomem 27% da sua renda” e “Em março seu saldo projetado fica negativo por causa do IPVA — considere planejar R$ 200/mês desde agora”.
- [ ] [PARCIAL] **Calendário e próximos vencimentos:** visão mensal com vencimentos de contas, parcelas, faturas, recorrentes, dívidas e aportes previstos por dia; cor por status (pago, pendente, atrasado); clicar no dia abre itens e permite marcar como pago; dashboard mostra lista “próximos 7 dias”.

## 6. Importação, exportação e backup

- [x] [IMPLEMENTADO] **Importar CSV/OFX:** importar extratos bancários e faturas de cartão; tela de mapeamento para escolher coluna de data, valor e descrição; aceitar formatos de data e separadores diferentes; pré-visualização e detecção de duplicados pela mesma data, valor e descrição.
- [ ] [PARCIAL] **Categorização automática:** regras “se a descrição contém X → categoria Y / forma de pagamento Z”; sugerir regras a partir do que for categorizado manualmente e aplicá-las em importações futuras. Exemplos: “IFOOD” → Restaurantes, “UBER” → Transporte, “UNIMED” → Saúde.
- [x] [IMPLEMENTADO] **Exportar:** CSV de lançamentos filtrados e relatórios em PDF (resumo do mês).
- [x] [IMPLEMENTADO] **Backup e restauração:** backup completo em JSON com contas, cartões, lançamentos, recorrentes, dívidas, metas, orçamentos, regras e anexos, com restauração; lembrete automático de backup a cada 30 dias.

## 7. Qualidade, privacidade, instalação e operação offline

- [x] [IMPLEMENTADO] Interface em português do Brasil; moeda R$ com formato 1.234,56; datas dd/mm/aaaa; aplicativo single-page responsivo para desktop e celular.
- [ ] [PARCIAL] Tema claro/escuro; modo privacidade com botão de olho que oculta todos os valores e persiste a preferência.
- [ ] [PARCIAL] Confirmação antes de excluir; lixeira permite restaurar itens por 30 dias.
- [ ] [PARCIAL] Lançamento rápido pelo dashboard (valor + descrição + categoria em 3 toques); atalhos de teclado no desktop e gestos de deslizar no celular para marcar pago/excluir.
- [x] [IMPLEMENTADO] Notificações locais de vencimentos no dia anterior, respeitando suporte e permissões do navegador; conforme limitação aprovada, avisos via Notification API quando o app estiver aberto e lembretes ao reabrir, sem alegar agendamento confiável com o PWA fechado.
- [ ] [PARCIAL] Configurações de moeda, primeiro dia do mês financeiro (ex.: começar no dia 5, dia do salário), categorias, regras e backup.
- [ ] [PARCIAL] Todos os dados permanecem no navegador, em IndexedDB, sem backend e sem login; app funciona offline e é instalável como PWA com manifest, service worker e ícone na tela inicial. Tratar indisponibilidade/cota de armazenamento com aviso e orientação para backup; armazenamento não é sincronizado nem ilimitado.
- [ ] [PARCIAL] Código organizado em módulos, com comentários; dados de exemplo são opcionais para testar.
