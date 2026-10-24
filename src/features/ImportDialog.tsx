import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import Papa from 'papaparse';
import { findDuplicates, parseLocalizedAmount, parseOfx, type ImportRow } from '../lib/importers';
import { invoiceMonthFor } from '../domain/finance';
import { db } from '../db';
import { newId } from '../lib/format';
import type { Account, BudgetRule, Category, CreditCard, Transaction } from '../types';

interface Props { accounts: Account[]; cards: CreditCard[]; categories: Category[]; rules: BudgetRule[]; onClose: () => void; onDone: () => void; }
function dateISO(value: string): string | null {
  const v = value.trim(); let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m = v.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) { let year = Number(m[3]); if (year < 100) year += year < 70 ? 2000 : 1900; return `${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  return null;
}
function headerIndex(fields: string[], terms: string[], fallback: number): number {
  const norm = (x:string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const i = fields.findIndex(f => terms.some(t => norm(f).includes(t))); return i >= 0 ? i : fallback;
}
export default function ImportDialog({ accounts, cards, categories, rules, onClose, onDone }: Props) {
  const [fileName, setFileName] = useState(''); const [format, setFormat] = useState<'csv'|'ofx'>('csv');
  const [headers, setHeaders] = useState<string[]>([]); const [rows, setRows] = useState<string[][]>([]); const [headerRow, setHeaderRow] = useState(true);
  const [dateCol,setDateCol]=useState(0); const [amountCol,setAmountCol]=useState(1); const [descriptionCol,setDescriptionCol]=useState(2);
  const [ofxRows,setOfxRows]=useState<ImportRow[]>([]); const [accountId,setAccountId]=useState(accounts.find(a=>!a.archived)?.id ?? ''); const [cardId,setCardId]=useState('');
  const [fallbackCategory,setFallbackCategory]=useState(categories.find(c=>c.kind==='expense')?.id ?? ''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const [dedupe,setDedupe]=useState<{unique:ImportRow[];duplicates:ImportRow[]}>({unique:[],duplicates:[]});
  const [mappingTouched,setMappingTouched]=useState(false);
  const csvRows = useMemo(() => {
    if (format !== 'csv' || rows.length===0) return [];
    const source = headerRow ? rows.slice(1) : rows;
    return source.flatMap((r,i) => {
      const date = dateISO(r[dateCol] ?? ''); const amountCents = parseLocalizedAmount(r[amountCol] ?? '');
      if(!date || amountCents===null) return [];
      return [{ date, amountCents, description: (r[descriptionCol] ?? '').trim(), sourceLine: i+(headerRow?2:1) }];
    });
  }, [format, rows, headerRow, dateCol, amountCol, descriptionCol]);
  const importRows = format==='ofx' ? ofxRows : csvRows;
  const existingPromise = async (incoming:ImportRow[]) => {
    const existing = (await db.transactions.toArray()).filter(t=>!t.deletedAt).map(t=>({date:t.date,amountCents:t.amountCents,description:t.description}));
    setDedupe(findDuplicates(incoming, existing));
  };
  useEffect(()=>{if(format==='csv'&&csvRows.length)void existingPromise(csvRows);},[format,csvRows]);
  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file=e.target.files?.[0]; if(!file)return;
    setFileName(file.name); setError(''); const text=await file.text();
    if(file.name.toLowerCase().endsWith('.ofx')) { setFormat('ofx'); const parsed=parseOfx(text); setOfxRows(parsed); setHeaders([]); setRows([]); void existingPromise(parsed); return; }
    setFormat('csv');
    const result=Papa.parse<string[]>(text,{header:false,skipEmptyLines:true,delimiter:'',dynamicTyping:false});
    const matrix=result.data;
    if(result.errors.length>0 && matrix.length===0){setError(result.errors[0].message);return;}
    const first=matrix[0]??[]; const looksHeader=first.some(v=>/[a-zA-ZÀ-ÿ]/.test(v)) && first.some(v=>/data|date|valor|amount|descr|histórico|historico/i.test(v));
    const hasHeader=looksHeader; setHeaderRow(hasHeader); setRows(matrix); setHeaders(hasHeader?first.map((v,i)=>v||`Coluna ${i+1}`):first.map((_,i)=>`Coluna ${i+1}`));
    const date=headerIndex(hasHeader?first:[],['data','date','posted','lancamento'],0);
    const amount=headerIndex(hasHeader?first:[],['valor','amount','value','debito','credito'],Math.min(1,first.length-1));
    const desc=headerIndex(hasHeader?first:[],['descricao','description','historico','name','merchant'],Math.min(2,first.length-1));
    setDateCol(date);setAmountCol(amount);setDescriptionCol(desc);setMappingTouched(false);
  }
  async function importSelected() {
    const duplicateKey = new Set(dedupe.duplicates.map(r=>`${r.date}|${r.amountCents}|${r.description.toLowerCase().trim()}`));
    const selected=dedupe.unique.filter(r=>!duplicateKey.has(`${r.date}|${r.amountCents}|${r.description.toLowerCase().trim()}`));
    if(!selected.length){setError('Não há novas linhas para importar.');return;}
    if(!accountId && !cardId){setError('Escolha a conta ou o cartão de destino.');return;}
    setBusy(true);setError('');
    try {
      const transactions:Transaction[]=[];
      for(const row of selected){
        const rule=rules.find(r=>row.description.toLowerCase().includes(r.contains.toLowerCase()));
        const expense=Boolean(cardId)||row.amountCents<0;
        const categoryId=rule?.categoryId ?? (expense ? fallbackCategory : categories.find(c=>c.kind==='income'&&!c.archived)?.id ?? fallbackCategory);
        const account=accountId||undefined;
        transactions.push({id:newId(),kind:expense?'expense':'income',amountCents:Math.abs(row.amountCents),date:row.date,categoryId,description:row.description||row.memo||'Importação bancária',accountId:cardId?undefined:account,cardId:expense?cardId||undefined:undefined,paymentMethod:rule?.paymentMethod??(cardId?'credit':'pix'),tags:['importado'],status:'paid',paidAt:row.date,notes:row.memo,invoiceMonth:undefined,createdAt:new Date().toISOString()});
      }
      const cardsList=cards;
      for(const tx of transactions) if(tx.cardId){const c=cardsList.find(x=>x.id===tx.cardId); if(c){tx.invoiceMonth=invoiceMonthFor(tx.date,c.closingDay);}}
      await db.transactions.bulkAdd(transactions); onDone(); onClose();
    } catch(e){setError(e instanceof Error?e.message:'Falha ao importar o arquivo.');setBusy(false);}
  }
  const availableCategories=categories.filter(c=>c.kind==='expense'&&!c.archived);
  return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="modal-card import-modal" role="dialog" aria-modal="true" aria-label="Importar extrato"><div className="modal-head"><div><p className="eyebrow">Importação local</p><h2>CSV ou OFX</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar">×</button></div>
    <div className="form-body"><label className="file-drop"><span>Escolher arquivo de extrato</span><small>CSV ou OFX · processado neste dispositivo</small><input type="file" accept=".csv,.ofx,text/csv,application/x-ofx" onChange={e=>void onFile(e)} /></label>
      {fileName&&<div className="notice-box"><b>{fileName}</b><span>{importRows.length} linhas reconhecidas</span></div>}
      {format==='csv'&&rows.length>0&&<><label className="check-field"><input type="checkbox" checked={headerRow} onChange={e=>{setHeaderRow(e.target.checked);setMappingTouched(true);}}/> Primeira linha contém cabeçalhos</label><div className="form-row"><label className="field"><span>Coluna de data</span><select value={dateCol} onChange={e=>{setDateCol(Number(e.target.value));setMappingTouched(true);}}>{headers.map((h,i)=><option key={i} value={i}>{h}</option>)}</select></label><label className="field"><span>Coluna de valor</span><select value={amountCol} onChange={e=>{setAmountCol(Number(e.target.value));setMappingTouched(true);}}>{headers.map((h,i)=><option key={i} value={i}>{h}</option>)}</select></label></div><label className="field"><span>Coluna de descrição</span><select value={descriptionCol} onChange={e=>{setDescriptionCol(Number(e.target.value));setMappingTouched(true);}}>{headers.map((h,i)=><option key={i} value={i}>{h}</option>)}</select></label>{mappingTouched&&<button className="btn secondary small" onClick={()=>void existingPromise(csvRows)}>Atualizar prévia/detectar duplicados</button>}</>}
      {importRows.length>0&&<><div className="form-row"><label className="field"><span>Conta</span><select value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Sem conta</option>{accounts.filter(a=>!a.archived).map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label><label className="field"><span>Cartão</span><select value={cardId} onChange={e=>setCardId(e.target.value)}><option value="">Sem cartão</option>{cards.filter(c=>!c.archived).map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label></div><label className="field"><span>Categoria padrão para linhas sem regra</span><select value={fallbackCategory} onChange={e=>setFallbackCategory(e.target.value)}>{availableCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="import-counts"><span>{dedupe.unique.length} novas</span><span>{dedupe.duplicates.length} possíveis duplicatas (serão ignoradas)</span></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>{dedupe.unique.slice(0,6).map((r,i)=><tr key={`${r.date}-${i}`}><td>{r.date}</td><td>{r.description}</td><td>{(r.amountCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td></tr>)}</tbody></table></div></>}
      {error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="btn secondary" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy||!importRows.length} onClick={()=>void importSelected()}>{busy?'Importando…':'Importar lançamentos'}</button></div>
    </div></section></div>;
}
