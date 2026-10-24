from pathlib import Path
p=Path('/home/ubuntu/bolsocal/src/features/Views.tsx')
s=p.read_text()
def once(old,new,label):
    global s
    n=s.count(old)
    if n!=1: raise SystemExit(f'{label}: esperado 1 trecho, encontrei {n}')
    s=s.replace(old,new,1)
once("import { accountBalances, buildInvoices, currentBudgetUse, expensesByCategory, monthTotals, netWorthCents } from '../domain/finance';",
      "import { accountBalances, buildInvoices, currentBudgetUse, expensesByCategory, goalBalanceCents, monthTotals, netWorthCents } from '../domain/finance';", 'import finance')
once("import type { Account, AppSettings, Budget, BudgetRule, Category, CreditCard, Debt, Goal, GoalMovement, Invoice, PlannedExpense, Receivable, RecurringItem, SavedFilter, Snapshot, Transaction, TrashItem } from '../types';",
      "import type { Account, AppSettings, Budget, BudgetRule, Category, CreditCard, Debt, Goal, Invoice, PlannedExpense, Receivable, RecurringItem, SavedFilter, Snapshot, Transaction, TrashItem } from '../types';", 'imports')
once("  transactions: Transaction[]; accounts: Account[]; cards: CreditCard[]; categories: Category[]; budgets: Budget[]; recurring: RecurringItem[];\n  debts: Debt[]; goals: Goal[]; goalMovements: GoalMovement[]; receivables: Receivable[]; planned: PlannedExpense[];",
      "  transactions: Transaction[]; accounts: Account[]; cards: CreditCard[]; categories: Category[]; budgets: Budget[]; recurring: RecurringItem[];\n  debts: Debt[]; goals: Goal[]; receivables: Receivable[]; planned: PlannedExpense[];", 'Data shape')
once("  onCreateRule:(entry:Transaction)=>void; onDeleteRule:(rule:BudgetRule)=>void; onPayDebt:(debt:Debt)=>void; onArchiveCard:(card:CreditCard)=>void;",
      "  onCreateRule:(entry:Transaction)=>void; onDeleteRule:(rule:BudgetRule)=>void; onPayDebt:(debt:Debt)=>void; onArchiveCard:(card:CreditCard)=>void;\n  onEditGoal:(goal:Goal)=>void; onDeleteGoal:(goal:Goal)=>void; onArchiveGoal:(goal:Goal)=>void;", 'Props')
start=s.index('function Goals(')
end=s.index('function Receipts(',start)
component='''function Goals({data,hidden,onNew,onDeposit,onEdit,onDelete,onArchive}:{data:Data;hidden:boolean;onNew:()=>void;onDeposit:()=>void;onEdit:(g:Goal)=>void;onDelete:(g:Goal)=>void;onArchive:(g:Goal)=>void}) {
  const [monthly,setMonthly]=useState('300');
  const [showArchived,setShowArchived]=useState(false);
  const goals=data.goals.filter(g=>Boolean(g.archived)===showArchived);
  return <div className="page-content">
    <PageTitle eyebrow="SEUS OBJETIVOS" title="Metas" desc="Acompanhe o progresso e ajuste o ritmo de cada objetivo." actions={<>
      <button className="btn secondary" onClick={()=>setShowArchived(!showArchived)}>{showArchived?'Ver metas ativas':'Metas arquivadas'}</button>
      {!showArchived&&<button className="btn secondary" onClick={onDeposit}><ArrowDownLeft size={15}/> Aporte ou resgate</button>}
      {!showArchived&&<button className="btn primary" onClick={onNew}><Plus size={16}/> Nova meta</button>}
    </>}/>
    {goals.length?<div className="goal-grid">{goals.map(g=>{
      const total=goalBalanceCents(g.id,data.transactions);
      const p=g.targetCents?Math.min(100,Math.max(0,total*100/g.targetCents)):0;
      const left=Math.max(0,g.targetCents-total);
      const months=g.deadline?Math.max(1,Math.ceil((new Date(g.deadline).getTime()-Date.now())/(30*86400000))):0;
      const needed=months?Math.ceil(left/months):0;
      const per=Number(monthly.replace(',','.'))*100;
      const eta=per>0?Math.ceil(left/per):0;
      const symbol:Record<string,string>={Alvo:'◎',Casa:'⌂',Estrela:'✦',Viagem:'↗',Reserva:'◌',Carro:'⌁',Estudo:'▤'};
      return <article className="panel goal-card" key={g.id}>
        <div className="goal-top"><span className="goal-symbol">{symbol[g.icon]??'✦'}</span><Pill tone={g.archived?'neutral':g.priority==='high'?'danger':'neutral'}>{g.archived?'Arquivada':g.priority==='high'?'Prioridade alta':g.priority==='low'?'Baixa':'Média'}</Pill></div>
        <h3>{g.name}</h3><div className="goal-progress"><strong>{currency(total,hidden)}</strong><span>de {currency(g.targetCents,hidden)}</span></div>
        <div className="progress-track"><i style={{width:`${p}%`}}/></div><div className="budget-foot"><span>{Math.round(p)}% concluído</span><span>{g.deadline?`Prazo ${formatDate(g.deadline)}`:'Sem prazo'}</span></div>
        {g.deadline&&<p className="goal-pace">{needed>0?`Para cumprir o prazo: ${currency(needed,hidden)}/mês.`:'Meta no ritmo.'}</p>}
        {!g.archived&&<div className="goal-simulator"><label className="field"><span>Se guardar por mês</span><input inputMode="decimal" value={monthly} onChange={e=>setMonthly(e.target.value)}/></label><small>{eta?`Você atinge em cerca de ${eta} ${eta===1?'mês':'meses'}.`:'Informe um valor mensal para simular.'}</small></div>}
        <div className="row-actions goal-actions">
          <button className="icon-button" aria-label={`Editar meta ${g.name}`} title="Editar meta" onClick={()=>onEdit(g)}><Pencil size={15}/></button>
          <button className="icon-button" aria-label={g.archived?`Reativar meta ${g.name}`:`Concluir ou arquivar meta ${g.name}`} title={g.archived?'Reativar meta':'Concluir/arquivar'} onClick={()=>onArchive(g)}>{g.archived?<RotateCcw size={15}/>:<Archive size={15}/>}</button>
          <button className="icon-button danger-icon" aria-label={`Excluir meta ${g.name}`} title="Excluir meta e movimentos para a lixeira" onClick={()=>onDelete(g)}><Trash2 size={15}/></button>
        </div>
        {!g.archived&&<button className="btn secondary small full-btn" onClick={onDeposit}>Registrar aporte ou resgate</button>}
      </article>;
    })}</div>:<Empty title={showArchived?'Nenhuma meta arquivada':'Escolha algo que importa'} body={showArchived?'As metas arquivadas aparecerão aqui.':'Viagem, reserva de emergência ou quitar dívida: acompanhe aportes e prazo em um só lugar.'} action={!showArchived?<button className="btn primary" onClick={onNew}><Plus size={16}/> Criar meta</button>:undefined}/>}
  </div>;
}
'''
s=s[:start]+component+s[end:]
once(" const {screen,data,month,privateMode,onMonthChange,onNew,onImport,onBackup,onRestoreBackup,onExportCsv,onExportPdf,onEditEntry,onDeleteEntry,onPayEntry,onPayInvoice,onReceive,onTogglePrivacy,onTheme,onMonthStart,onNotifications,onArchiveAccount,onToggleRecurring,onCopyBudgets,onSuggestBudgets,onConvertPlan,onRestore,onPurgeTrash,onSaveFilter,onDeleteFilter,onCreateRule,onDeleteRule,onPayDebt,onArchiveCard}=props;",
      " const {screen,data,month,privateMode,onMonthChange,onNew,onImport,onBackup,onRestoreBackup,onExportCsv,onExportPdf,onEditEntry,onDeleteEntry,onPayEntry,onPayInvoice,onReceive,onTogglePrivacy,onTheme,onMonthStart,onNotifications,onArchiveAccount,onToggleRecurring,onCopyBudgets,onSuggestBudgets,onConvertPlan,onRestore,onPurgeTrash,onSaveFilter,onDeleteFilter,onCreateRule,onDeleteRule,onPayDebt,onArchiveCard,onEditGoal,onDeleteGoal,onArchiveGoal}=props;", 'destructure')
once(" if(screen==='goals')return <Goals data={data} hidden={privateMode} onNew={()=>onNew('goal')} onDeposit={()=>onNew('deposit')}/>;",
      " if(screen==='goals')return <Goals data={data} hidden={privateMode} onNew={()=>onNew('goal')} onDeposit={()=>onNew('deposit')} onEdit={onEditGoal} onDelete={onDeleteGoal} onArchive={onArchiveGoal}/>;", 'goal route')
p.write_text(s)
print('Updated Views.tsx: goal accounting and management controls.')
