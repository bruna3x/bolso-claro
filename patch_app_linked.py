from pathlib import Path
p=Path('/home/ubuntu/bolsocal/src/App.tsx')
s=p.read_text()
def once(old,new,label):
    global s
    n=s.count(old)
    if n!=1: raise SystemExit(f'{label}: esperado 1 trecho, encontrei {n}')
    s=s.replace(old,new,1)
once("import { generateCurrentObligations, moveTransactionToTrash, purgeExpiredTrash, restoreTrashItem, settleReceivable } from './db/operations';",
      "import { generateCurrentObligations, migrateLegacyLedgers, moveGoalToTrash, moveTransactionToTrash, purgeExpiredTrash, restoreTrashItem, settleReceivable } from './db/operations';", 'operations import')
once("import { accountBalances, buildInvoices, monthTotals, netWorthCents } from './domain/finance';",
      "import { accountBalances, buildInvoices, debtLedgerState, monthTotals, netWorthCents } from './domain/finance';", 'finance import')
once("import type { Account, AppSettings, BudgetRule, Category, CreditCard as CardRecord, Debt, Invoice, PlannedExpense, Receivable, RecurringItem, Transaction, TrashItem } from './types';",
      "import type { Account, AppSettings, BudgetRule, Category, CreditCard as CardRecord, Debt, Goal, Invoice, PlannedExpense, Receivable, RecurringItem, Transaction, TrashItem } from './types';", 'types import')
once("interface ModalState { kind: ModalKind; entry?:Transaction; invoice?:Invoice; category?:Category; }",
      "interface ModalState { kind: ModalKind; entry?:Transaction; invoice?:Invoice; category?:Category; goal?:Goal; }", 'modal shape')
once(" const goalMovements=useLiveQuery(()=>db.goalMovements.toArray(),[])??[];\n", '', 'legacy query')
once(" const privateMode=Boolean(settings?.privacyMode); const currentMonth=month; const currentBalances=accountBalances(accounts,transactions);\n const data=useMemo(()=>({transactions,accounts,cards,categories,budgets,recurring,debts,goals,goalMovements,receivables,planned,rules,filters,snapshots,trash,settings}),[transactions,accounts,cards,categories,budgets,recurring,debts,goals,goalMovements,receivables,planned,rules,filters,snapshots,trash,settings]);",
      " const privateMode=Boolean(settings?.privacyMode); const currentMonth=month; const currentBalances=accountBalances(accounts,transactions);\n const debtStates=useMemo(()=>debts.map(debt=>debtLedgerState(debt,transactions)),[debts,transactions]);\n const data=useMemo(()=>({transactions,accounts,cards,categories,budgets,recurring,debts:debtStates,goals,receivables,planned,rules,filters,snapshots,trash,settings}),[transactions,accounts,cards,categories,budgets,recurring,debtStates,goals,receivables,planned,rules,filters,snapshots,trash,settings]);", 'derived data')
once("initializeDatabase().then(generateCurrentObligations).then(purgeExpiredTrash)",
      "initializeDatabase().then(migrateLegacyLedgers).then(generateCurrentObligations).then(purgeExpiredTrash)", 'init migration')
old=" const onPayEntry=async(entry:Transaction)=>{const debtId=entry.recurrenceId?.startsWith('debt:')?entry.recurrenceId.slice(5):undefined;const debt=debtId?debts.find(d=>d.id===debtId):undefined;if(debt){const outstanding=Math.min(entry.amountCents,debt.balanceCents);const interest=Math.round(debt.balanceCents*debt.monthlyRateBps/10000);const principal=Math.max(0,outstanding-interest);await db.transaction('rw',db.debts,db.transactions,async()=>{await db.debts.update(debt.id,{balanceCents:Math.max(0,debt.balanceCents-principal),paidInstallments:debt.paidInstallments+1,interestPaidCents:debt.interestPaidCents+interest,active:debt.balanceCents-principal>0});await db.transactions.update(entry.id,{amountCents:outstanding,status:'paid',paidAt:todayISO()});});notify('Parcela e saldo devedor atualizados.');return;}await db.transaction('rw',db.transactions,db.recurring,db.goalMovements,async()=>{await db.transactions.update(entry.id,{status:'paid',paidAt:todayISO()});if(entry.recurrenceId){const item=await db.recurring.get(entry.recurrenceId);if(item&&item.variable)await db.recurring.update(item.id,{amountCents:entry.amountCents});}if(entry.kind==='goalContribution'&&entry.relatedId){const prior=(await db.goalMovements.where('goalId').equals(entry.relatedId).toArray()).some(m=>m.date===entry.date&&m.amountCents===entry.amountCents&&m.kind==='deposit');if(!prior)await db.goalMovements.add({id:newId(),goalId:entry.relatedId,date:entry.date,amountCents:entry.amountCents,kind:'deposit',accountId:entry.accountId});}});notify('Lançamento marcado como pago.');};"
new=""" const onPayEntry=async(entry:Transaction)=>{
   const debtId=entry.relatedId??(entry.recurrenceId?.startsWith('debt:')?entry.recurrenceId.slice(5):undefined);
   const debt=debtId?debtStates.find(d=>d.id===debtId):undefined;
   if(debt){
     const outstanding=Math.min(entry.amountCents,debt.balanceCents);
     await db.transactions.update(entry.id,{amountCents:outstanding,status:'paid',paidAt:todayISO(),relatedId:debt.id,recurrenceId:entry.recurrenceId??`debt:${debt.id}`});
     notify('Parcela registrada; saldo e juros são recalculados pelo histórico.');return;
   }
   await db.transaction('rw',db.transactions,db.recurring,async()=>{
     await db.transactions.update(entry.id,{status:'paid',paidAt:todayISO()});
     if(entry.recurrenceId){const item=await db.recurring.get(entry.recurrenceId);if(item&&item.variable)await db.recurring.update(item.id,{amountCents:entry.amountCents});}
   });
   notify('Lançamento marcado como pago.');
 };"""
once(old,new,'pay entry handler')
old=" const onPayDebt=async(debt:Debt)=>{const outstanding=Math.min(debt.installmentCents,debt.balanceCents);if(!window.confirm(`Registrar parcela de ${((outstanding)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} em ${debt.name}?`))return;const interest=Math.round(debt.balanceCents*debt.monthlyRateBps/10000);const principal=Math.max(0,outstanding-interest);await db.transaction('rw',db.debts,db.transactions,async()=>{await db.debts.update(debt.id,{balanceCents:Math.max(0,debt.balanceCents-principal),paidInstallments:debt.paidInstallments+1,interestPaidCents:debt.interestPaidCents+interest,active:debt.balanceCents-principal>0});const due=transactions.find(t=>t.recurrenceId===`debt:${debt.id}`&&t.date.startsWith(currentMonth)&&t.status!=='paid');if(due)await db.transactions.update(due.id,{status:'paid',paidAt:todayISO()});else await db.transactions.add({id:newId(),kind:'expense',amountCents:outstanding,date:todayISO(),categoryId:debt.categoryId,description:`Parcela · ${debt.name}`,accountId:debt.accountId,tags:['dívida'],status:'paid',paidAt:todayISO(),recurrenceId:`debt:${debt.id}`,createdAt:new Date().toISOString()});});notify('Parcela registrada.');};"
new=""" const onPayDebt=async(debt:Debt)=>{
   const current=debtStates.find(d=>d.id===debt.id);if(!current||!current.active)return;
   const paidThisMonth=transactions.some(t=>!t.deletedAt&&t.status==='paid'&&t.date.startsWith(currentMonth)&&(t.relatedId===current.id||t.recurrenceId===`debt:${current.id}`));
   if(paidThisMonth){notify('A parcela desta dívida já foi registrada neste mês.');return;}
   const due=transactions.find(t=>!t.deletedAt&&t.status!=='paid'&&t.date.startsWith(currentMonth)&&(t.relatedId===current.id||t.recurrenceId===`debt:${current.id}`));
   const outstanding=Math.min(due?.amountCents??current.installmentCents,current.balanceCents);
   if(!window.confirm(`Registrar parcela de ${((outstanding)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} em ${current.name}?`))return;
   const paidAt=todayISO();
   if(due) await db.transactions.update(due.id,{amountCents:outstanding,status:'paid',paidAt,relatedId:current.id,recurrenceId:due.recurrenceId??`debt:${current.id}`});
   else await db.transactions.add({id:newId(),kind:'expense',amountCents:outstanding,date:paidAt,categoryId:current.categoryId,description:`Parcela · ${current.name}`,accountId:current.accountId,tags:['dívida'],status:'paid',paidAt,relatedId:current.id,recurrenceId:`debt:${current.id}`,createdAt:new Date().toISOString()});
   notify('Parcela registrada; saldo e juros são recalculados pelo histórico.');
 };"""
once(old,new,'pay debt handler')
once("netWorthCents(accounts,balances,buildInvoices(cards,transactions),debts)",
      "netWorthCents(accounts,balances,buildInvoices(cards,transactions),debtStates)", 'PDF net worth')
once(" const onArchiveCard=async(card:CardRecord)=>{if(!window.confirm(`Arquivar ${card.name}? O histórico das faturas será mantido.`))return;await db.cards.update(card.id,{archived:!card.archived});};",
      " const onArchiveCard=async(card:CardRecord)=>{if(!window.confirm(`Arquivar ${card.name}? O histórico das faturas será mantido.`))return;await db.cards.update(card.id,{archived:!card.archived});};\n const onEditGoal=(goal:Goal)=>setModal({kind:'goal',goal});\n const onDeleteGoal=async(goal:Goal)=>{const movements=transactions.filter(t=>!t.deletedAt&&t.relatedId===goal.id&&(t.kind==='goalContribution'||t.kind==='goalWithdrawal')).length;if(!window.confirm(`Excluir a meta “${goal.name}” e enviar a meta e seus ${movements} aportes/resgates para a lixeira?`))return;await moveGoalToTrash(goal);notify('Meta e movimentos enviados à lixeira.');};\n const onArchiveGoal=async(goal:Goal)=>{const next=!goal.archived;if(!window.confirm(`${next?'Concluir/arquivar':'Reativar'} a meta “${goal.name}”?`))return;await db.goals.update(goal.id,{archived:next});notify(next?'Meta arquivada.':'Meta reativada.');};", 'goal management')
once("<Views screen={screen} data={data} month={month} privateMode={privateMode} onMonthChange={setMonth} onNavigate={setScreen} onNew={(kind,category)=>{setModal({kind,category});}}",
      "<Views screen={screen} data={data} month={month} privateMode={privateMode} onMonthChange={setMonth} onNavigate={setScreen} onNew={(kind,category)=>{setModal({kind,category});}}", 'Views start')
once("onPayDebt={onPayDebt} onArchiveCard={onArchiveCard}/>",
      "onPayDebt={onPayDebt} onArchiveCard={onArchiveCard} onEditGoal={onEditGoal} onDeleteGoal={onDeleteGoal} onArchiveGoal={onArchiveGoal}/>", 'Views callbacks')
once("key={`${modal.kind}-${modal.entry?.id??modal.category?.id??modal.invoice?.id??'new'}`} kind={modal.kind}",
      "key={`${modal.kind}-${modal.entry?.id??modal.category?.id??modal.goal?.id??modal.invoice?.id??'new'}`} kind={modal.kind}", 'modal key')
once("editCategory={modal.category} balances={currentBalances}",
      "editCategory={modal.category} editGoal={modal.goal} balances={currentBalances}", 'modal goal prop')
p.write_text(s)
print('Updated App.tsx: ledger-derived debt payments, meta lifecycle and migration startup.')
