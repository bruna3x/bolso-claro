import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Papa from 'papaparse';
import { ArrowDownLeft, ArrowLeft, Check, Download, Eye, EyeOff, Home, Plus, Settings2, ShieldCheck, Wallet } from 'lucide-react';
import Views, { parentOf, type Screen } from './features/Views';
import ImportDialog from './features/ImportDialog';
import FormModal, { type ModalKind } from './components/FormModal';
import { db, initializeDatabase } from './db';
import { generateCurrentObligations, migrateLegacyLedgers, moveGoalToTrash, moveTransactionToTrash, purgeExpiredTrash, restoreTrashItem } from './db/operations';
import { createBackup, downloadJson, restoreBackup } from './lib/backup';
import { addMonthsKey, monthKey, newId, todayISO } from './lib/format';
import { accountBalances, debtLedgerState, debtPaymentAmountCents } from './domain/finance';
import { editFormFor } from './domain/goals';
import type { Account, AppSettings, Category, CreditCard as CardRecord, Debt, Goal, Invoice, RecurringItem, Transaction, TrashItem } from './types';
import './styles.css';

interface ModalState { kind: ModalKind; entry?:Transaction; invoice?:Invoice; category?:Category; goal?:Goal; }
interface ToastState { text:string; undo?:()=>Promise<void>; }
const primaryNav:{id:Screen;label:string;icon:typeof Home}[]=[{id:'dashboard',label:'Início',icon:Home},{id:'transactions',label:'Lançamentos',icon:ArrowDownLeft},{id:'budget',label:'Orçamento',icon:Wallet},{id:'settings',label:'Ajustes',icon:Settings2}];

export default function App(){
 const [screen,setScreen]=useState<Screen>('dashboard'); const [month,setMonth]=useState(monthKey()); const [modal,setModal]=useState<ModalState|null>(null); const [showImport,setShowImport]=useState(false);
 const [initialized,setInitialized]=useState(false); const [fatal,setFatal]=useState(''); const [installPrompt,setInstallPrompt]=useState<(Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>})|null>(null); const [toast,setToast]=useState<ToastState|null>(null); const toastTimer=useRef<number|undefined>(undefined);
 const transactions=useLiveQuery(()=>db.transactions.toArray(),[])??[];
 const accounts=useLiveQuery(()=>db.accounts.toArray(),[])??[];
 const cards=useLiveQuery(()=>db.cards.toArray(),[])??[];
 const categories=useLiveQuery(()=>db.categories.toArray(),[])??[];
 const budgets=useLiveQuery(()=>db.budgets.toArray(),[])??[];
 const recurring=useLiveQuery(()=>db.recurring.toArray(),[])??[];
 const debts=useLiveQuery(()=>db.debts.toArray(),[])??[];
 const goals=useLiveQuery(()=>db.goals.toArray(),[])??[];
 const receivables=useLiveQuery(()=>db.receivables.toArray(),[])??[];
 const rules=useLiveQuery(()=>db.rules.toArray(),[])??[];
 const settings=useLiveQuery(()=>db.settings.get('app'),[]) as AppSettings|undefined;
 const privateMode=Boolean(settings?.privacyMode); const currentMonth=month; const currentBalances=accountBalances(accounts,transactions);
 const debtStates=useMemo(()=>debts.map(debt=>debtLedgerState(debt,transactions)),[debts,transactions]);
 const data=useMemo(()=>({transactions,accounts,cards,categories,budgets,recurring,goals,receivables,settings}),[transactions,accounts,cards,categories,budgets,recurring,goals,receivables,settings]);

 useEffect(()=>{let active=true;void navigator.storage?.persist?.().catch(()=>false);initializeDatabase().then(migrateLegacyLedgers).then(generateCurrentObligations).then(purgeExpiredTrash).then(()=>{if(active)setInitialized(true);}).catch(e=>{if(active)setFatal(e instanceof Error?e.message:'Não foi possível abrir o armazenamento local.');});return()=>{active=false;};},[]);
 useEffect(()=>{if(!settings)return;const last=settings.lastBackupReminder?new Date(settings.lastBackupReminder).getTime():0;if(Date.now()-last>=30*86400000){const timer=window.setTimeout(()=>setToast({text:'Lembrete: faça um backup JSON dos dados locais.'}),900);return()=>window.clearTimeout(timer);}},[settings?.lastBackupReminder]);
 useEffect(()=>{const beforeInstall=(event:Event)=>{event.preventDefault();setInstallPrompt(event as Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>});};window.addEventListener('beforeinstallprompt',beforeInstall);return()=>window.removeEventListener('beforeinstallprompt',beforeInstall);},[]);
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='n'){e.preventDefault();setModal({kind:'entry'});}if(e.key==='Escape'){setModal(null);setShowImport(false);}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
 const showToast=useCallback((text:string,undo?:()=>Promise<void>)=>{window.clearTimeout(toastTimer.current);setToast({text,undo});toastTimer.current=window.setTimeout(()=>setToast(null),undo?6000:2600);},[]);
 const notify=useCallback((text:string)=>showToast(text),[showToast]);
 // Excluir manda para a lixeira na hora (o expurgo de 30 dias continua); "Desfazer" restaura os itens recém-criados nela.
 const offerUndo=(trashIds:string[],text:string)=>showToast(text,async()=>{const items=(await db.trash.bulkGet(trashIds)).filter((item):item is TrashItem=>Boolean(item));for(const item of items)await restoreTrashItem(item);notify('Exclusão desfeita.');});
 const onUndo=()=>{const undo=toast?.undo;window.clearTimeout(toastTimer.current);setToast(null);if(undo)void undo();};
 const openModal=(kind:ModalKind,category?:Category)=>setModal({kind,category});
 const updateSettings=async(update:Partial<AppSettings>)=>{await db.settings.update('app',update);};
 const onTogglePrivacy=()=>void updateSettings({privacyMode:!privateMode});
 const onPayDebt=async(debt:Debt,scheduledEntry?:Transaction,requireConfirmation=true)=>{
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
 const onEditEntry=(entry:Transaction)=>setModal({kind:editFormFor(entry),entry});
 const onDeleteEntry=async(entry:Transaction)=>{let remove=[entry];if(entry.seriesId){const answer=window.prompt('Este item faz parte de um parcelamento. Digite 1 para excluir apenas esta parcela ou todas para remover esta e as restantes.','1');if(answer===null)return;if(answer.toLowerCase().startsWith('t'))remove=transactions.filter(t=>t.seriesId===entry.seriesId&&!t.deletedAt);}
   const trashIds:string[]=[];for(const tx of remove)trashIds.push(await moveTransactionToTrash(tx));offerUndo(trashIds,remove.length>1?`${remove.length} parcelas excluídas`:'Excluído');};
 const onPayInvoice=(invoice:Invoice)=>setModal({kind:'invoice',invoice});
 const onArchiveAccount=async(account:Account)=>{if(!window.confirm(`${account.archived?'Reativar':'Arquivar'} ${account.name}? O histórico será mantido.`))return;await db.accounts.update(account.id,{archived:!account.archived});};
 const onArchiveCard=async(card:CardRecord)=>{if(!window.confirm(`Arquivar ${card.name}? O histórico das faturas será mantido.`))return;await db.cards.update(card.id,{archived:!card.archived});};
 const onEditGoal=(goal:Goal)=>setModal({kind:'goal',goal});
 const onDeleteGoal=async(goal:Goal)=>{const trashId=await moveGoalToTrash(goal);if(trashId)offerUndo([trashId],'Meta excluída');};
 const onArchiveGoal=async(goal:Goal)=>{const next=!goal.archived;if(!window.confirm(`${next?'Concluir/arquivar':'Reativar'} a meta “${goal.name}”?`))return;await db.goals.update(goal.id,{archived:next});notify(next?'Meta arquivada.':'Meta reativada.');};
 const onToggleRecurring=(item:RecurringItem)=>void db.recurring.update(item.id,{active:!item.active,pausedAt:item.active?todayISO():undefined});
 const onCopyBudgets=async()=>{const previous=addMonthsKey(currentMonth,-1);const old=budgets.filter(b=>b.month===previous);for(const b of old){if(!budgets.some(x=>x.month===currentMonth&&x.categoryId===b.categoryId&&x.subcategory===b.subcategory))await db.budgets.add({...b,id:newId(),month:currentMonth});}notify(old.length?'Orçamentos do mês anterior copiados.':'Não há orçamentos no mês anterior.');};
 const onSuggestBudgets=async()=>{let count=0;for(const category of categories.filter(c=>c.kind==='expense')){const months=[-1,-2,-3].map(n=>addMonthsKey(currentMonth,n));const values=months.map(m=>transactions.filter(t=>!t.deletedAt&&t.kind==='expense'&&t.categoryId===category.id&&t.date.startsWith(m)).reduce((s,t)=>s+t.amountCents,0));const average=Math.round(values.reduce((s,v)=>s+v,0)/3);if(average>0){const old=budgets.find(b=>b.month===currentMonth&&b.categoryId===category.id);await db.budgets.put({id:old?.id??newId(),month:currentMonth,categoryId:category.id,amountCents:average});count++;}}notify(count?`${count} sugestões criadas pela média dos últimos 3 meses.`:'Ainda não há histórico suficiente para sugerir valores.');};
 const onExportCsv=(items:Transaction[])=>{const csv=Papa.unparse(items.map(t=>({data:t.date,tipo:t.kind==='income'?'receita':t.kind==='expense'?'despesa':t.kind,valor:(t.amountCents/100).toFixed(2).replace('.',','),descricao:t.description,categoria:categories.find(c=>c.id===t.categoryId)?.name??'',subcategoria:t.subcategory??'',conta:accounts.find(a=>a.id===t.accountId)?.name??'',conta_destino:accounts.find(a=>a.id===t.destinationAccountId)?.name??'',cartao:cards.find(c=>c.id===t.cardId)?.name??'',forma:t.paymentMethod??'',status:t.status,vencimento:t.dueDate??'',tags:t.tags.join('|'),observacoes:t.notes??'',comprovante:t.attachment?.name??''})),{delimiter:';'});const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=`bolso-claro-lancamentos-${todayISO()}.csv`;a.click();URL.revokeObjectURL(a.href);};
 const onBackup=async()=>{try{const backup=await createBackup();downloadJson(backup,`bolso-claro-backup-${todayISO()}.json`);await updateSettings({lastBackupReminder:new Date().toISOString()});notify('Backup JSON baixado neste dispositivo.');}catch(e){notify(e instanceof Error?e.message:'Falha ao gerar backup.');}};
 const onRestoreBackup=async(file:File)=>{if(!window.confirm('Restaurar este backup substituirá os dados locais atuais. Continuar?'))return;try{await restoreBackup(JSON.parse(await file.text()));notify('Backup restaurado com sucesso.');}catch(e){notify(e instanceof Error?e.message:'Backup inválido.');}};
 const onImportDone=()=>notify('Importação concluída.');
 const onSaveModal=()=>{};
 const onInstall=async()=>{if(!installPrompt)return;await installPrompt.prompt();const result=await installPrompt.userChoice;if(result.outcome==='accepted')notify('Instalação iniciada.');setInstallPrompt(null);};
 const viewTitle:Record<Screen,string>={dashboard:'Início',transactions:'Lançamentos',budget:'Orçamento',goals:'Metas',settings:'Ajustes',accounts:'Contas',cards:'Cartões',recurring:'Recorrentes',categories:'Categorias',data:'Dados',preferences:'Preferências'};
 const tab=parentOf[screen]??screen;
 if(fatal)return <main className="fatal-screen"><ShieldCheck size={32}/><h1>Os dados locais não abriram</h1><p>{fatal}</p><p>O app não enviou dados a nenhum servidor. Tente recarregar; se persistir, verifique o armazenamento do navegador.</p></main>;
 if(!initialized)return <main className="loading-screen"><div className="brand-mark">◉</div><h1>Bolso Claro</h1><p>Preparando seus dados neste dispositivo…</p></main>;
 return <div className="app-shell"><aside className="sidebar"><div className="brand-lockup"><div className="brand-icon">◉</div><div><strong>Bolso Claro</strong><small>FINANÇAS PESSOAIS</small></div></div><div className="local-badge"><span/><span>Armazenado neste dispositivo</span></div><nav className="side-nav" aria-label="Navegação principal">{primaryNav.map(({id,label,icon:Icon})=><button key={id} className={tab===id?'active':''} onClick={()=>setScreen(id)}><Icon size={18}/><span>{label}</span></button>)}</nav><div className="sidebar-bottom"><button className="side-setting" onClick={onTogglePrivacy}>{privateMode?<Eye size={17}/>:<EyeOff size={17}/>} {privateMode?'Mostrar valores':'Ocultar valores'}</button></div></aside>
    <main className="main-area"><header className="mobile-topbar"><button className="mobile-brand" onClick={()=>setScreen('dashboard')}><span className="brand-icon">◉</span><strong>Bolso Claro</strong></button><div className="mobile-top-actions"><button className="icon-button" onClick={onTogglePrivacy} aria-label={privateMode?'Mostrar valores':'Ocultar valores'}>{privateMode?<Eye size={18}/>:<EyeOff size={18}/>}</button></div></header><div className="desktop-pagebar"><div>{parentOf[screen]==='settings'&&<button className="back-button" onClick={()=>setScreen('settings')}><ArrowLeft size={15}/> Ajustes</button>}<span>{viewTitle[screen]}</span></div><div className="pagebar-actions">{installPrompt&&<button className="btn secondary small" onClick={()=>void onInstall()}><Download size={14}/> Instalar app</button>}<button className="icon-button" onClick={onTogglePrivacy} title={privateMode?'Mostrar valores':'Ocultar valores'}>{privateMode?<Eye size={17}/>:<EyeOff size={17}/>}</button></div></div>
      <Views screen={screen} data={data} month={month} privateMode={privateMode} onMonthChange={setMonth} onNavigate={setScreen} onNew={(kind,category)=>{setModal({kind,category});}} onImport={()=>setShowImport(true)} onBackup={()=>void onBackup()} onRestoreBackup={file=>void onRestoreBackup(file)} onExportCsv={onExportCsv} onEditEntry={onEditEntry} onPayEntry={onPayEntry} onPayInvoice={onPayInvoice} onTogglePrivacy={onTogglePrivacy} onMonthStart={day=>void updateSettings({monthStartDay:day})} onArchiveAccount={onArchiveAccount} onArchiveCard={onArchiveCard} onToggleRecurring={onToggleRecurring} onCopyBudgets={()=>void onCopyBudgets()} onSuggestBudgets={()=>void onSuggestBudgets()} onEditGoal={onEditGoal} onDeleteGoal={onDeleteGoal} onArchiveGoal={onArchiveGoal}/>
    </main><nav className="bottom-nav" aria-label="Navegação móvel">{primaryNav.map(({id,label,icon:Icon})=><button key={id} onClick={()=>setScreen(id)} className={tab===id?'active':''}><Icon size={19}/><span>{label}</span></button>)}</nav><button className="fab" onClick={()=>openModal('entry')} aria-label="Novo lançamento"><Plus size={24}/></button>
    {modal&&<FormModal key={`${modal.kind}-${modal.entry?.id??modal.category?.id??modal.goal?.id??modal.invoice?.id??'new'}`} kind={modal.kind} month={currentMonth} accounts={accounts} cards={cards} categories={categories} goals={goals} debts={debts} entry={modal.entry} invoice={modal.invoice} editCategory={modal.category} editGoal={modal.goal} balances={currentBalances} onDelete={entry=>void onDeleteEntry(entry)} onPay={entry=>void onPayEntry(entry)} onClose={()=>setModal(null)} onDone={onSaveModal}/>}
    {showImport&&<ImportDialog accounts={accounts} cards={cards} categories={categories} rules={rules} onClose={()=>setShowImport(false)} onDone={onImportDone}/>}
    {toast&&<div role="status" className="toast"><Check size={16}/>{toast.text}{toast.undo&&<> · <button type="button" className="toast-action" onClick={onUndo}>Desfazer</button></>}</div>}
  </div>;
}
