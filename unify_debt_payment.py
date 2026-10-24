from pathlib import Path
p=Path('/home/ubuntu/bolsocal/src/App.tsx')
s=p.read_text()
start=s.index(' const onPayEntry=')
end=s.index(' const onEditEntry=',start)
replacement=''' const onPayDebt=async(debt:Debt,scheduledEntry?:Transaction,requireConfirmation=true)=>{
   const current=debtStates.find(d=>d.id===debt.id);if(!current||!current.active)return;
   const paidThisMonth=transactions.some(t=>!t.deletedAt&&t.status==='paid'&&((t.paidAt??t.date).startsWith(currentMonth))&&(t.relatedId===current.id||t.recurrenceId===`debt:${current.id}`));
   if(paidThisMonth){notify('A parcela desta dívida já foi registrada neste mês.');return;}
   const due=scheduledEntry&&!scheduledEntry.deletedAt&&scheduledEntry.status!=='paid'?scheduledEntry:transactions.find(t=>!t.deletedAt&&t.status!=='paid'&&t.date.startsWith(currentMonth)&&(t.relatedId===current.id||t.recurrenceId===`debt:${current.id}`));
   const outstanding=debtPaymentAmountCents(current,due?.amountCents??current.installmentCents);
   if(requireConfirmation&&!window.confirm(`Registrar parcela de ${((outstanding)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} em ${current.name}?`))return;
   const paidAt=todayISO();
   if(due) await db.transactions.update(due.id,{amountCents:outstanding,status:'paid',paidAt,relatedId:current.id,recurrenceId:due.recurrenceId??`debt:${current.id}`});
   else await db.transactions.add({id:newId(),kind:'expense',amountCents:outstanding,date:paidAt,categoryId:current.categoryId,description:`Parcela · ${current.name}`,accountId:current.accountId,tags:['dívida'],status:'paid',paidAt,relatedId:current.id,recurrenceId:`debt:${current.id}`,createdAt:new Date().toISOString()});
   notify('Parcela registrada; saldo e juros são recalculados pelo histórico.');
 };
 const onPayEntry=async(entry:Transaction)=>{
   const debtId=entry.relatedId??(entry.recurrenceId?.startsWith('debt:')?entry.recurrenceId.slice(5):undefined);
   const debt=debtId?debtStates.find(d=>d.id===debtId):undefined;
   if(debt){await onPayDebt(debt,entry,false);return;}
   await db.transaction('rw',db.transactions,db.recurring,async()=>{
     await db.transactions.update(entry.id,{status:'paid',paidAt:todayISO()});
     if(entry.recurrenceId){const item=await db.recurring.get(entry.recurrenceId);if(item&&item.variable)await db.recurring.update(item.id,{amountCents:entry.amountCents});}
   });
   notify('Lançamento marcado como pago.');
 };
'''
s=s[:start]+replacement+s[end:]
# Remove the previous duplicate onPayDebt implementation.
start=s.index(' const onPayDebt=async(debt:Debt)=>')
end=s.index(' const onExportCsv=',start)
s=s[:start]+s[end:]
p.write_text(s)
print('All debt payment paths now call the same onPayDebt function.')
