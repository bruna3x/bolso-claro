# Plano de implementação — Bolso Claro

## Produto e limites técnicos

Aplicativo de finanças pessoais em português brasileiro, mobile-first, de página única e responsivo, entregue como PWA instalável. A opção implementada será **Web/PWA**, não um app nativo Expo: o requisito explícito de manter tudo no navegador, sem backend e sem login, com funcionamento offline, é incompatível com o starter Mobile gerenciado do WebDev, que ativa servidor e banco. O projeto Web já foi inicializado sem esses serviços (`server:false`, `database:false`).

O frontend será estático e os dados do usuário serão persistidos exclusivamente em IndexedDB. Não haverá chamadas a API para usar as funções financeiras, nem conta, sincronização ou telemetria financeira. IndexedDB guardará lançamentos, contas, anexos, preferências e demais entidades; armazenamento em valores inteiros de centavos evita erros de ponto flutuante. Será solicitado ao navegador armazenamento persistente quando suportado, sem prometer que o navegador jamais limpará dados. Backup JSON será o mecanismo de restauração e migração entre dispositivos.

A PWA terá manifest, ícones próprios e service worker para cache dos arquivos necessários ao shell offline. O manifesto será da aplicação (`application_owned`) para que o app controle instalação, ícones e comportamento offline. A implementação será organizada em React, TypeScript e Vite, com dependências locais ao build; nenhuma integração financeira externa será introduzida.

## Organização de telas e navegação

No celular, navegação inferior com **Visão geral**, **Lançamentos**, **Orçamento**, **Planejamento** e **Mais**. A ação de novo lançamento ficará sempre acessível e abrirá um formulário curto em painel inferior; no dashboard, valor, descrição e categoria formam o fluxo rápido. No desktop, a navegação passa para uma barra lateral, mantendo os mesmos módulos.

O dashboard terá seletor de mês, saldo geral e por conta, entradas, saídas, aportes, valores a pagar e a receber, limite de cartão, categorias, compromissos próximos e gráficos. “Mais” reunirá contas, cartões, recorrentes, dívidas, reembolsos, metas, calendário, lixeira e configurações. Lançamentos terá pesquisa, filtros e filtros salvos. Orçamento terá visão mensal por categoria/subcategoria. Planejamento agrupará projeções, gastos futuros e simulador “e se”.

## Dados e módulos

- `src/db/`: banco IndexedDB/Dexie, esquema versionado, migrações, seeds de categorias e repositórios. Anexos de foto/PDF ficam como Blob no IndexedDB e são visualizados localmente.
- `src/domain/`: regras puras de saldos, relatórios, fechamento de cartão, parcelamentos, recorrências, dívidas, reembolsos, metas, orçamento, snapshots e projeção. Transferências e ajustes terão tratamento próprio para não distorcer receitas/despesas.
- `src/features/`: módulos independentes de dashboard, lançamentos, contas, cartões/faturas, recorrentes, orçamento, planejamento, metas, dívidas, reembolsos, calendário, importação/exportação, lixeira e configurações.
- `src/components/`: componentes acessíveis reutilizáveis, navegação, formulários, gráficos, filtros, diálogos e estados vazios.
- `src/pwa/` e `public/`: registro do service worker, atualização/cache offline, manifest e ícones.

Categorias iniciais, incluindo as categorias de despesa e receita listadas na especificação, serão editáveis com subcategorias, cores e ícones. A geração de recorrências será idempotente e acontecerá ao abrir o app, evitando duplicatas; lançamentos variáveis continuarão pendentes para confirmação. Lançamentos parcelados terão vínculo de série e número “n/N”, com ações para uma parcela ou parcelas restantes. Faturas obedecerão à data de fechamento e distinguirão aberta, fechada, paga e paga parcialmente; o pagamento gera saída na conta vinculada. O saldo disponível considerará compras e compromissos futuros sem contar pagamento de fatura como uma segunda despesa de consumo.

Orçamentos, tendências, comparações, ritmo diário e projeções serão calculados localmente. Insights em linguagem simples serão regras determinísticas baseadas nos números reais — por exemplo, percentual acima do orçamento, mudança contra o mês anterior e metas fora do ritmo — sem enviar dados a um modelo externo. A projeção de 12 meses combinará recorrentes, parcelas, faturas, dívidas, planejamentos e aportes. Simulações ficarão isoladas dos registros reais. Snapshots patrimoniais serão registrados quando o app voltar a ser usado após o fim de um mês.

Dívidas terão progresso, juros e ordenação escolhida (maior juros ou menor saldo). Divisões e reembolsos serão recebíveis vinculados; reembolso recebido reduzirá/zerará o custo elegível e não inflará receita operacional. Metas terão aportes, resgates, conta vinculada, ritmo, prioridades e simuladores. Exclusões terão confirmação e lixeira restaurável por 30 dias.

## Importação, exportação e privacidade

Importação CSV terá escolha de delimitador, cabeçalho, mapeamento data/valor/descrição, reconhecimento de formatos comuns, prévia e detecção de duplicidade por data+valor+descrição antes de gravar. OFX de extratos e faturas será convertido para uma prévia local. Regras editáveis do tipo “descrição contém X → categoria/forma de pagamento” poderão ser salvas após categorização manual. Exportação permitirá CSV filtrado, PDF de resumo mensal e backup/restauração JSON com todas as entidades e anexos.

Tema claro/escuro e modo privacidade serão persistidos localmente. Formatação usa `pt-BR`, BRL (R$ 1.234,56) e datas dd/mm/aaaa; a configuração permitirá primeiro dia do mês financeiro. Teclas de atalho serão habilitadas no desktop; gestos de deslizar no celular complementarão ações acessíveis por botões. As notificações solicitarão permissão apenas após ação explícita da usuária.

## PWA e limitações de notificações/armazenamento

O service worker armazenará o shell e os assets para abrir o app offline; registros financeiros permanecerão no IndexedDB e não dependerão do service worker. A instalação e as notificações dependem do suporte/permissões do navegador e do sistema operacional.

**Limitação a aprovar:** uma PWA sem backend não consegue agendar de modo confiável notificações locais futuras enquanto está fechada em todos os navegadores/sistemas, especialmente iOS. O plano é emitir lembretes de vencimento um dia antes via Notification API quando o app estiver aberto e exibir os lembretes vencidos/iminentes ao reabrir; não declarar funcionamento garantido em segundo plano. Para notificações confiáveis com o app encerrado, seria necessário aceitar um app nativo com agendamento local ou um serviço de push/backend, em conflito com a restrição atual de PWA local sem backend.

**Limitação a aprovar:** a capacidade do IndexedDB varia conforme navegador e espaço disponível; comprovantes e backups grandes podem exceder a cota. O app mostrará falha de gravação claramente, permitirá remover anexos e orientará exportar backup. Isso não equivale a armazenamento ilimitado ou sincronizado.

## Direção visual

Três opções distintas consideradas (probabilidades amostradas abaixo de 0,10):

- Editorial financeiro brasileiro, tipografia expressiva e verde-lima sobre papel quente (0,07).
- Brutalismo suave, blocos de cor terrosa e divisórias inspiradas em cadernos contábeis (0,04).
- Painel neo-industrial, grafite, azul elétrico e rótulos técnicos compactos (0,02).

**Escolha: editorial financeiro brasileiro com acentos de verde-lima.**

- **Movimento de design:** editorial suíço de informação financeira, reinterpretado com calor brasileiro e detalhes de caderno-caixa.
- **Princípios centrais:** números primeiro; hierarquia inequívoca; linguagem direta sem julgamento; controles confortáveis para uma mão.
- **Filosofia de cor:** fundo marfim suave reduz o cansaço; verde profundo comunica estabilidade; verde-lima é a cor proprietária para ações e saldo positivo; âmbar e coral ficam reservados para atenção e excesso, nunca apenas como decoração.
- **Paradigma de layout:** no celular, fluxo vertical de saldo → resumo → ação → categorias e agenda; em telas largas, dashboard assimétrico com navegação lateral e painel principal amplo, sem centralizar tudo numa grade uniforme.
- **Elementos de assinatura:** cartão de saldo em verde profundo com pequeno motivo circular de moeda; trilhas de categoria com proporções nítidas; etiquetas de status em forma de cápsula.
- **Interação:** lançamento rápido em painel inferior; valores importantes sempre legíveis; confirmações antes de excluir/pagar; feedback imediato e opção desfazer quando aplicável.
- **Animação:** transições curtas (150–220 ms), barras de progresso animadas uma vez, sem movimento ornamental; respeitar `prefers-reduced-motion`.
- **Tipografia:** Inter local/autohospedada para interface e números; escala tipográfica clara, títulos compactos e números tabulares para comparação; fallback de sistema para funcionamento offline.
- **Essência da marca:** organização financeira cotidiana para quem quer decidir melhor sem perder tempo; personalidade: clara, confiável e prática.
- **Voz:** objetiva, acolhedora e sem culpa. Exemplos: “Seu dinheiro, sem surpresas.” / “Restaurantes está 32% acima do orçamento.”
- **Marca/ícone:** símbolo geométrico próprio juntando contorno de moeda e três barras ascendentes, legível em tamanho pequeno e sem cantos arredondados incorporados ao arquivo do ícone.
- **Cor de marca:** verde-lima `#C8F36A`, aplicado com moderação sobre verde profundo `#123B32` e papel `#F6F5EF`.

## Fluxo de entrega

Após aprovação deste plano, registrar os resultados e critérios completos em `TODO.md`, configurar diagnósticos TypeScript, preparar dependências com versões fixadas, implementar módulos e PWA, verificar compilação e diagnósticos, e revisar a cobertura do escopo. O dashboard será validado em tamanhos móveis e desktop quando necessário. Antes do checkpoint será configurado o ícone/logo de projeto conforme o contrato do WebDev. O checkpoint não implica publicação; publicação só ocorrerá se solicitada/explicitamente autorizada.
