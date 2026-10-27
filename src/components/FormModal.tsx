import { useMemo, useState, type FormEvent } from 'react';
import { Check, Paperclip, Trash2, X } from 'lucide-react';
import { db } from '../db';
import { invoiceMonthFor } from '../domain/finance';
import { buildGoalMovement, goalAccountFor, isGoalMovement } from '../domain/goals';
import { newId, safeDay, todayISO } from '../lib/format';
import type { Account, Budget, Category, CreditCard, Debt, EntryStatus, Goal, Invoice, PaymentMethod, RecurringItem, Transaction } from '../types';

export type ModalKind = 'entry' | 'adjustment' | 'account' | 'card' | 'budget' | 'recurring' | 'goal' | 'category' | 'deposit' | 'invoice';
interface Props {
  kind: ModalKind; month: string; accounts: Account[]; cards: CreditCard[]; categories: Category[]; goals: Goal[]; debts: Debt[];
  onClose: () => void; onDone: () => void; entry?: Transaction; invoice?: Invoice; editCategory?: Category; editGoal?: Goal; balances?: Record<string, number>;
  onDelete?: (entry: Transaction) => void; onPay?: (entry: Transaction) => void;
}
const paymentLabels: Record<PaymentMethod, string> = { cash: 'Dinheiro', pix: 'Pix', debit: 'Débito', credit: 'Crédito', boleto: 'Boleto', transfer: 'Transferência', voucher: 'Vale' };
const frequencies: Record<RecurringItem['frequency'], string> = { weekly: 'Semanal', fortnightly: 'Quinzenal', monthly: 'Mensal', bimonthly: 'Bimestral', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual' };
const dollars = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
function centsOf(value: string): number {
  const clean = value.trim().replace(/\s|R\$/gi, '');
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const n = Number(normalized); return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function shiftDate(iso: string, amount: number): string {
  const [y, m, d] = iso.split('-').map(Number); const date = new Date(y, m - 1 + amount, 1); date.setDate(safeDay(d, date.getFullYear(), date.getMonth()));
  return date.toLocaleDateString('en-CA');
}
function TextField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function Title({ kind, onClose, editingGoal = false }: { kind: ModalKind; onClose: () => void; editingGoal?: boolean }) {
  const labels: Record<ModalKind, string> = { entry: 'Lançamento', adjustment: 'Ajustar saldo real', account: 'Conta', card: 'Cartão de crédito', budget: 'Orçamento', recurring: 'Item recorrente', goal: 'Meta financeira', category: 'Categoria', deposit: 'Movimentar meta', invoice: 'Pagar fatura' };
  return <div className="modal-head"><div><p className="eyebrow">Bolso Claro</p><h2>{editingGoal ? 'Editar meta' : labels[kind]}</h2></div><button className="icon-button" type="button" aria-label="Fechar" onClick={onClose}><X size={19} /></button></div>;
}

export default function FormModal(props: Props) {
  const { kind, month, accounts, cards, categories, goals, debts, onClose, onDone, entry, invoice, editCategory, editGoal, balances = {}, onDelete, onPay } = props;
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [name, setName] = useState(entry?.description ?? editCategory?.name ?? editGoal?.name ?? '');
  const [amount, setAmount] = useState(entry ? dollars(entry.amountCents) : ''); const [realBalance, setRealBalance] = useState('');
  const [date, setDate] = useState(entry?.date ?? todayISO());
  const [description, setDescription] = useState(entry?.description ?? '');
  const [entryKind, setEntryKind] = useState<Transaction['kind']>(entry?.kind ?? (kind === 'category' ? editCategory?.kind ?? 'expense' : kind === 'adjustment' ? 'adjustment' : 'expense')); const [subcategory, setSubcategory] = useState(entry?.subcategory ?? '');
  const [categoryId, setCategoryId] = useState(entry?.categoryId ?? '');
  const [accountId, setAccountId] = useState(entry?.accountId ?? (editGoal ? editGoal.accountId ?? '' : accounts.find(a => !a.archived)?.id ?? ''));
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [cardId, setCardId] = useState(entry?.cardId ?? '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(entry?.paymentMethod ?? 'pix');
  const [status, setStatus] = useState<EntryStatus>(entry && entry.status !== 'paid' ? 'pending' : 'paid');
  const [dueDate, setDueDate] = useState(entry?.dueDate ?? '');
  const [tags, setTags] = useState(entry?.tags.join(', ') ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [attachment, setAttachment] = useState<Transaction['attachment']>(entry?.attachment);
  const [accountType, setAccountType] = useState<Account['type']>('checking');
  const [color, setColor] = useState(editCategory?.color ?? '#C8F36A');
  const [limit, setLimit] = useState(editGoal?.automaticMonthlyCents ? dollars(editGoal.automaticMonthlyCents) : ''); const [closingDay, setClosingDay] = useState('10'); const [dueDay, setDueDay] = useState('20');
  const [subcategories, setSubcategories] = useState(editCategory?.subcategories.join(', ') ?? '');
  const [installments, setInstallments] = useState('1'); const [isTotal, setIsTotal] = useState(true); const [futureEdit, setFutureEdit] = useState(false);
  const [variable, setVariable] = useState(false); const [frequency, setFrequency] = useState<RecurringItem['frequency']>('monthly'); const [startDate, setStartDate] = useState(todayISO()); const [endDate, setEndDate] = useState('');
  const [target, setTarget] = useState(editGoal ? dollars(editGoal.targetCents) : ''); const [goalId, setGoalId] = useState(entry?.relatedId ?? goals.find(g => !g.archived)?.id ?? ''); const [goalKind, setGoalKind] = useState<Goal['kind']>(entry?.kind === 'goalWithdrawal' ? 'debt' : editGoal?.kind ?? 'save');
  const [priority, setPriority] = useState<Goal['priority']>(editGoal?.priority ?? 'medium'); const [deadline, setDeadline] = useState(editGoal?.deadline ?? ''); const [goalIcon, setGoalIcon] = useState(editGoal?.icon ?? 'Alvo'); const [creditor, setCreditor] = useState('');
  const [budgetAmount, setBudgetAmount] = useState(''); const [monthInput, setMonthInput] = useState(month); const [includeInTotal, setIncludeInTotal] = useState(true);
  const incomeCategories = useMemo(() => categories.filter(c => c.kind === 'income' && !c.archived), [categories]);
  const expenseCategories = useMemo(() => categories.filter(c => c.kind === 'expense' && !c.archived), [categories]);
  const filteredCategories = entryKind === 'income' ? incomeCategories : expenseCategories;
  const selectedCategory = categories.find(c => c.id === categoryId);
  const valueCents = centsOf(amount);
  const selectedGoal = goals.find(g => g.id === goalId);
  const otherAccount = (goal?: Goal) => accounts.find(a => !a.archived && a.id !== goal?.accountId)?.id ?? '';
  const [depositAccountId, setDepositAccountId] = useState(entry?.accountId ?? otherAccount(selectedGoal));
  const depositGoalAccountId = goalAccountFor(selectedGoal, goalKind === 'debt', entry);
  const chooseGoal = (id: string) => { setGoalId(id); const goal = goals.find(g => g.id === id); if (goal?.accountId && depositAccountId === goal.accountId) setDepositAccountId(otherAccount(goal)); };
  const setFailure = (message: string) => { setError(message); setBusy(false); };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (kind === 'adjustment') {
        if (!accountId || !realBalance.trim()) throw new Error('Escolha a conta e informe o saldo real atualizado.');
        const difference = centsOf(realBalance) - (balances[accountId] ?? 0);
        if (difference === 0) throw new Error('O saldo informado é igual ao saldo calculado.');
        await db.transactions.add({ id: newId(), kind: 'adjustment', amountCents: difference, date, description: description.trim() || 'Ajuste de saldo', accountId, tags: ['ajuste'], notes, status: 'paid', paidAt: date, createdAt: new Date().toISOString() });
      } else if (kind === 'entry') {
        const count = Math.max(1, Math.min(120, Number(installments) || 1));
        const total = valueCents;
        if (total <= 0) throw new Error('Informe um valor maior que zero.');
        const seriesId = count > 1 ? (entry?.seriesId ?? newId()) : undefined;
        const baseId = entry?.id ?? newId();
        const base = {
          kind: entryKind, date, categoryId: entryKind === 'transfer' || entryKind === 'adjustment' ? undefined : categoryId,
          subcategory: entryKind === 'income' || entryKind === 'expense' ? subcategory || undefined : undefined, description: description.trim() || 'Lançamento', accountId: entryKind === 'expense' && paymentMethod === 'credit' ? undefined : accountId || undefined,
          destinationAccountId: entryKind === 'transfer' ? destinationAccountId : undefined,
          cardId: entryKind === 'expense' && paymentMethod === 'credit' ? cardId || undefined : undefined,
          paymentMethod, tags: tags.split(',').map(t => t.trim()).filter(Boolean), notes, attachment, status,
          dueDate: dueDate || undefined, paidAt: status === 'paid' ? date : undefined, createdAt: entry?.createdAt ?? new Date().toISOString()
        };
        if (entry) {
          const updated: Transaction = { ...entry, ...base, amountCents: total };
          await db.transactions.put(updated);
          if (futureEdit && entry.seriesId && entry.installmentIndex) {
            const rest = await db.transactions.where('seriesId').equals(entry.seriesId).toArray();
            const nextAmount = Math.round(total);
            await db.transactions.bulkPut(rest.filter(t => (t.installmentIndex ?? 0) > entry.installmentIndex!).map(t => ({ ...t, amountCents: nextAmount, description: base.description, categoryId: base.categoryId, accountId: base.accountId, status: base.status })));
          }
        } else {
      const installmentCents = isTotal ? Math.floor(total / count) : total;
      const generated: Transaction[] = Array.from({ length: count }, (_, index) => {
        const dateAt = index === 0 ? date : shiftDate(date, index);
        const cents = isTotal && index === count - 1 ? total - installmentCents * (count - 1) : installmentCents;
        const card = cards.find(c => c.id === cardId);
        const installmentStatus = count > 1 && index > 0 && status === 'paid' ? 'pending' : status;
        return { id: index === 0 ? baseId : newId(), ...base, amountCents: cents, date: dateAt, status: installmentStatus, dueDate: installmentStatus === 'paid' ? undefined : (dueDate ? shiftDate(dueDate, index) : dateAt),
          paidAt: installmentStatus === 'paid' ? dateAt : undefined, seriesId, installmentIndex: count > 1 ? index + 1 : undefined, installmentCount: count > 1 ? count : undefined,
              invoiceMonth: card && entryKind === 'expense' ? invoiceMonthFor(dateAt, card.closingDay) : undefined };
          });
          await db.transactions.bulkAdd(generated);
        }
      } else if (kind === 'account') {
        if (!name.trim()) throw new Error('Informe o nome da conta.');
        await db.accounts.add({ id: newId(), name: name.trim(), type: accountType, initialBalanceCents: valueCents, color, icon: 'Conta', includeInTotal, archived: false, createdAt: new Date().toISOString() });
      } else if (kind === 'card') {
        if (!name.trim() || !accountId) throw new Error('Informe o nome do cartão e uma conta para pagar a fatura.');
        await db.cards.add({ id: newId(), name: name.trim(), brand: creditor || 'Visa', limitCents: centsOf(limit), closingDay: Math.max(1, Math.min(31, Number(closingDay))), dueDay: Math.max(1, Math.min(31, Number(dueDay))), paymentAccountId: accountId, color, archived: false });
      } else if (kind === 'invoice' && invoice) {
        const paymentCents = valueCents || invoice.remainingCents;
        if (paymentCents <= 0 || paymentCents > invoice.remainingCents) throw new Error('O pagamento deve ser maior que zero e não superar o saldo da fatura.');
        const card = cards.find(c => c.id === invoice.cardId); if (!card) throw new Error('Cartão não encontrado.');
        await db.transactions.add({ id: newId(), kind: 'cardPayment', amountCents: paymentCents, date: todayISO(), description: `Pagamento da fatura · ${card.name}`, accountId: card.paymentAccountId, cardId: card.id, invoiceMonth: invoice.month, tags: [], status: 'paid', paidAt: todayISO(), createdAt: new Date().toISOString() });
      } else if (kind === 'budget') {
        if (!categoryId || centsOf(budgetAmount) <= 0) throw new Error('Escolha a categoria e informe um orçamento.');
        const old = await db.budgets.where('[month+categoryId]').equals([monthInput, categoryId]).first();
        const row: Budget = { id: old?.id ?? newId(), month: monthInput, categoryId, amountCents: centsOf(budgetAmount) };
        await db.budgets.put(row);
      } else if (kind === 'recurring') {
        if (!name.trim() || !categoryId || valueCents < 0) throw new Error('Informe nome, categoria e valor.');
        await db.recurring.add({ id: newId(), name: name.trim(), kind: entryKind === 'income' ? 'income' : 'expense', amountCents: valueCents, variable, categoryId, accountId: paymentMethod === 'credit' ? undefined : accountId || undefined, cardId: paymentMethod === 'credit' ? cardId || undefined : undefined, paymentMethod, frequency, dueDay: Math.max(1, Math.min(31, Number(dueDay))), startDate, endDate: endDate || undefined, active: true });
      } else if (kind === 'goal') {
        if (!name.trim() || centsOf(target) <= 0) throw new Error('Informe o nome e o valor-alvo.');
        await db.goals.put({ id: editGoal?.id ?? newId(), name: name.trim(), icon: goalIcon, targetCents: centsOf(target), deadline: deadline || undefined, accountId: accountId || undefined, priority, kind: editGoal?.kind ?? goalKind, debtId: editGoal?.debtId ?? (goalKind === 'debt' ? debts[0]?.id : undefined), automaticMonthlyCents: centsOf(limit) || undefined, archived: editGoal?.archived, createdAt: editGoal?.createdAt ?? new Date().toISOString() });
      } else if (kind === 'deposit') {
        if (!selectedGoal) throw new Error('Escolha uma meta e informe um valor.');
        await db.transactions.put(buildGoalMovement({ goal: selectedGoal, withdrawal: goalKind === 'debt', amountCents: valueCents, date, accountId: depositAccountId, notes, entry }));
      } else if (kind === 'category') {
        const categoryKind = entryKind === 'income' ? 'income' : 'expense';
        if (!name.trim()) throw new Error('Informe o nome da categoria.');
        await db.categories.put({ id: editCategory?.id ?? newId(), name: name.trim(), kind: categoryKind, color, icon: 'Ponto', subcategories: subcategories.split(',').map(x => x.trim()).filter(Boolean) });
      }
      onDone(); onClose();
    } catch (e) { setFailure(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
  }
  const titleEdit = kind === 'entry' && entry ? 'Editar lançamento' : kind === 'deposit' && entry ? 'Salvar movimento' : kind === 'goal' && editGoal ? 'Editar meta' : undefined;
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={titleEdit ?? kind}>
    <Title kind={kind} onClose={onClose} editingGoal={Boolean(editGoal)} />
    <form onSubmit={submit} className="form-body">
      {kind === 'adjustment' && <><div className="notice-box"><b>Saldo calculado</b><span>{((balances[accountId] ?? 0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span></div><TextField label="Conta a ajustar"><select value={accountId} onChange={e=>setAccountId(e.target.value)} required><option value="">Escolha</option>{accounts.filter(a=>!a.archived).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></TextField><TextField label="Saldo real atualizado"><input autoFocus inputMode="decimal" value={realBalance} onChange={e=>setRealBalance(e.target.value)} placeholder="0,00" required /></TextField><TextField label="Data do ajuste"><input type="date" value={date} onChange={e=>setDate(e.target.value)} required /></TextField><TextField label="Observação"><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional" /></TextField></>}
      {kind === 'entry' && <>
        <TextField label="Tipo" hint={isGoalMovement(entryKind) ? 'Aporte e resgate se editam em "Movimentar meta".' : undefined}><select value={entryKind} disabled={isGoalMovement(entryKind)} onChange={e => { setEntryKind(e.target.value as Transaction['kind']); setCategoryId(''); }}>{isGoalMovement(entryKind) && <><option value="goalContribution">Aporte em meta</option><option value="goalWithdrawal">Resgate de meta</option></>}<option value="expense">Despesa</option><option value="income">Receita</option><option value="transfer">Transferência</option><option value="adjustment">Ajuste de saldo</option></select></TextField>
        <div className="form-row"><TextField label="Valor"><input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" required /></TextField><TextField label="Data"><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></TextField></div>
        <TextField label="Descrição"><input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex.: mercado, salário..." /></TextField>
        {(entryKind === 'income' || entryKind === 'expense') && <div className="form-row"><TextField label="Categoria"><select value={categoryId} onChange={e => { setCategoryId(e.target.value); setSubcategory(''); }} required><option value="">Escolha</option>{filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></TextField><TextField label="Forma de pagamento"><select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}>{Object.entries(paymentLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></TextField></div>}
        {(entryKind === 'income' || entryKind === 'expense') && (selectedCategory?.subcategories.length ?? 0) > 0 && <TextField label="Subcategoria"><select value={subcategory} onChange={e=>setSubcategory(e.target.value)}><option value="">Sem subcategoria</option>{selectedCategory?.subcategories.map(sub=><option key={sub} value={sub}>{sub}</option>)}</select></TextField>}
        {entryKind === 'transfer' ? <div className="form-row"><TextField label="Origem"><select value={accountId} onChange={e => setAccountId(e.target.value)} required>{accounts.filter(a=>!a.archived).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></TextField><TextField label="Destino"><select value={destinationAccountId} onChange={e => setDestinationAccountId(e.target.value)} required><option value="">Escolha</option>{accounts.filter(a=>!a.archived&&a.id!==accountId).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></TextField></div> : (paymentMethod !== 'credit' || entryKind === 'adjustment') ? <TextField label={entryKind === 'adjustment' ? 'Conta a ajustar' : 'Conta'}><select value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Selecione uma conta</option>{accounts.filter(a=>!a.archived).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></TextField> : <TextField label="Cartão de crédito"><select value={cardId} onChange={e => setCardId(e.target.value)} required><option value="">Escolha</option>{cards.filter(c=>!c.archived).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></TextField>}
        {entryKind !== 'adjustment' && entryKind !== 'transfer' && <div className="form-row"><TextField label="Status"><select value={status} onChange={e => setStatus(e.target.value as EntryStatus)}><option value="paid">Pago/recebido</option><option value="pending">Pendente</option></select></TextField><TextField label="Vencimento"><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} /></TextField></div>}
        {!entry && entryKind === 'expense' && <details className="optional-fields"><summary>Parcelas</summary><div className="form-row"><TextField label="Número de parcelas"><input type="number" min="1" max="120" value={installments} onChange={e=>setInstallments(e.target.value)} /></TextField><label className="check-field"><input type="checkbox" checked={isTotal} onChange={e=>setIsTotal(e.target.checked)} /> Valor informado é o total</label></div></details>}
        {entry?.seriesId && <label className="check-field"><input type="checkbox" checked={futureEdit} onChange={e=>setFutureEdit(e.target.checked)} /> Aplicar alterações também às parcelas futuras</label>}
        <TextField label="Tags"><input value={tags} onChange={e=>setTags(e.target.value)} placeholder="Separe por vírgulas" /></TextField>
        <TextField label="Observações"><textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} /></TextField>
        <TextField label="Comprovante (foto ou PDF)"><span className="file-pick"><Paperclip size={16}/>{attachment?.name ?? 'Anexar arquivo'}<input type="file" accept="image/*,application/pdf" onChange={e=>{const f=e.target.files?.[0]; if(f)setAttachment({name:f.name,mimeType:f.type,size:f.size,blob:f});}} /></span></TextField>
      </>}
      {kind === 'account' && <><TextField label="Nome"><input value={name} onChange={e=>setName(e.target.value)} required placeholder="Ex.: Conta principal" /></TextField><TextField label="Tipo"><select value={accountType} onChange={e=>setAccountType(e.target.value as Account['type'])}><option value="checking">Conta corrente</option><option value="savings">Poupança</option><option value="cash">Carteira / dinheiro físico</option><option value="investment">Investimento</option><option value="meal">Vale-alimentação/refeição</option></select></TextField><div className="form-row"><TextField label="Saldo inicial"><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00" /></TextField><TextField label="Cor"><input type="color" value={color} onChange={e=>setColor(e.target.value)} /></TextField></div><label className="check-field"><input type="checkbox" checked={includeInTotal} onChange={e=>setIncludeInTotal(e.target.checked)} /> Incluir no saldo total</label></>}
      {kind === 'card' && <><TextField label="Nome do cartão"><input value={name} onChange={e=>setName(e.target.value)} required placeholder="Ex.: Cartão do dia a dia" /></TextField><div className="form-row"><TextField label="Bandeira"><input value={creditor} onChange={e=>setCreditor(e.target.value)} placeholder="Visa, Mastercard..." /></TextField><TextField label="Limite total"><input inputMode="decimal" value={limit} onChange={e=>setLimit(e.target.value)} placeholder="0,00" /></TextField></div><div className="form-row"><TextField label="Fecha no dia"><input type="number" min="1" max="31" value={closingDay} onChange={e=>setClosingDay(e.target.value)} /></TextField><TextField label="Vence no dia"><input type="number" min="1" max="31" value={dueDay} onChange={e=>setDueDay(e.target.value)} /></TextField></div><TextField label="Conta para pagar fatura"><select value={accountId} onChange={e=>setAccountId(e.target.value)} required><option value="">Escolha</option>{accounts.filter(a=>!a.archived).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></TextField><TextField label="Cor"><input type="color" value={color} onChange={e=>setColor(e.target.value)} /></TextField></>}
      {kind === 'invoice' && invoice && <><div className="notice-box"><b>{invoice.month}</b><span>Saldo da fatura: R$ {(invoice.remainingCents/100).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div><TextField label="Valor do pagamento"><input autoFocus inputMode="decimal" value={amount || dollars(invoice.remainingCents)} onChange={e=>setAmount(e.target.value)} /></TextField><p className="helper-text">O pagamento reduz o saldo da conta vinculada e não conta como uma nova despesa de consumo.</p></>}
      {kind === 'budget' && <><TextField label="Mês"><input type="month" value={monthInput} onChange={e=>setMonthInput(e.target.value)} /></TextField><TextField label="Categoria"><select value={categoryId} onChange={e=>setCategoryId(e.target.value)} required><option value="">Escolha</option>{expenseCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></TextField><TextField label="Orçamento"><input inputMode="decimal" value={budgetAmount} onChange={e=>setBudgetAmount(e.target.value)} placeholder="0,00" /></TextField></>}
      {kind === 'recurring' && <><TextField label="Nome"><input value={name} onChange={e=>setName(e.target.value)} required placeholder="Ex.: Plano de saúde" /></TextField><div className="form-row"><TextField label="Tipo"><select value={entryKind === 'income' ? 'income' : 'expense'} onChange={e=>setEntryKind(e.target.value as Transaction['kind'])}><option value="expense">Despesa</option><option value="income">Receita</option></select></TextField><TextField label="Valor"><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} /></TextField></div><TextField label="Categoria"><select value={categoryId} onChange={e=>setCategoryId(e.target.value)} required><option value="">Escolha</option>{(entryKind==='income'?incomeCategories:expenseCategories).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></TextField><div className="form-row"><TextField label="Frequência"><select value={frequency} onChange={e=>setFrequency(e.target.value as RecurringItem['frequency'])}>{Object.entries(frequencies).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></TextField><TextField label="Dia de vencimento"><input type="number" min="1" max="31" value={dueDay} onChange={e=>setDueDay(e.target.value)} /></TextField></div><div className="form-row"><TextField label="Início"><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} /></TextField><TextField label="Fim (opcional)"><input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} /></TextField></div><TextField label="Conta"><select value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Escolha</option>{accounts.filter(a=>!a.archived).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></TextField><label className="check-field"><input type="checkbox" checked={variable} onChange={e=>setVariable(e.target.checked)} /> Valor variável (confirmar no mês)</label></>}
      {kind === 'goal' && <><TextField label="Nome da meta"><input value={name} onChange={e=>setName(e.target.value)} required placeholder="Ex.: Viagem" /></TextField><div className="form-row">{!editGoal&&<TextField label="Tipo"><select value={goalKind} onChange={e=>setGoalKind(e.target.value as Goal['kind'])}><option value="save">Juntar dinheiro</option><option value="debt">Quitar dívida</option><option value="emergency">Reserva de emergência</option></select></TextField>}<TextField label="Ícone"><select value={goalIcon} onChange={e=>setGoalIcon(e.target.value)}>{['Alvo','Casa','Estrela','Viagem','Reserva','Carro','Estudo'].map(icon=><option key={icon}>{icon}</option>)}</select></TextField><TextField label="Prioridade"><select value={priority} onChange={e=>setPriority(e.target.value as Goal['priority'])}><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></TextField></div><div className="form-row"><TextField label="Valor-alvo"><input inputMode="decimal" value={target} onChange={e=>setTarget(e.target.value)} required /></TextField><TextField label="Prazo"><input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)} /></TextField></div><TextField label="Conta onde o dinheiro da meta fica" hint={accountId ? 'Aporte vira transferência para esta conta: o saldo total não cai.' : 'Sem conta, o aporte só sai da conta de origem.'}><select value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Nenhuma</option>{accounts.filter(a=>!a.archived).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></TextField>{!editGoal&&<TextField label="Aporte automático mensal (opcional)"><input inputMode="decimal" value={limit} onChange={e=>setLimit(e.target.value)} /></TextField>}</>}
      {kind === 'deposit' && <><TextField label="Meta"><select value={goalId} onChange={e=>chooseGoal(e.target.value)} required>{goals.filter(g=>!g.archived||g.id===entry?.relatedId).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></TextField><div className="form-row"><TextField label="Movimento"><select value={goalKind} onChange={e=>setGoalKind(e.target.value as Goal['kind'])}><option value="save">Aporte</option><option value="debt">Resgate</option></select></TextField><TextField label="Valor"><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} /></TextField></div><div className="form-row"><TextField label="Data"><input type="date" value={date} onChange={e=>setDate(e.target.value)} /></TextField><TextField label={goalKind === 'debt' ? 'Conta que recebe' : 'Conta de origem'}><select value={depositAccountId} onChange={e=>setDepositAccountId(e.target.value)}><option value="">Escolha</option>{accounts.filter(a=>(!a.archived||a.id===depositAccountId)&&a.id!==depositGoalAccountId).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></TextField></div><p className="helper-text">{depositGoalAccountId ? `O dinheiro ${goalKind === 'debt' ? 'sai de' : 'vai para'} ${accounts.find(a=>a.id===depositGoalAccountId)?.name ?? 'a conta da meta'}. O saldo total não muda.` : selectedGoal?.accountId ? 'Movimento anterior à conta da meta: editar não muda de onde o dinheiro saiu.' : 'Esta meta não tem conta própria: o aporte só sai da conta de origem. Escolha a conta na edição da meta.'}</p><TextField label="Observação"><input value={notes} onChange={e=>setNotes(e.target.value)} /></TextField></>}
      {kind === 'category' && <><TextField label="Nome"><input value={name} onChange={e=>setName(e.target.value)} required /></TextField><TextField label="Tipo"><select value={entryKind === 'income' ? 'income' : 'expense'} onChange={e=>setEntryKind(e.target.value as Transaction['kind'])}><option value="expense">Despesa</option><option value="income">Receita</option></select></TextField><div className="form-row"><TextField label="Cor"><input type="color" value={color} onChange={e=>setColor(e.target.value)} /></TextField><TextField label="Subcategorias"><input value={subcategories} onChange={e=>setSubcategories(e.target.value)} placeholder="Separe por vírgulas" /></TextField></div></>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">{entry && (kind === 'entry' || kind === 'deposit') && <>{onDelete && <button type="button" className="btn secondary danger-text" onClick={() => { onDelete(entry); onClose(); }}><Trash2 size={15} /> Excluir</button>}{onPay && entry.status !== 'paid' && <button type="button" className="btn secondary" onClick={() => { onPay(entry); onClose(); }}><Check size={15} /> Pagar</button>}</>}<button type="button" className="btn secondary" onClick={onClose}>Cancelar</button><button className="btn primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : titleEdit ?? 'Salvar'}</button></div>
    </form>
  </section></div>;
}
