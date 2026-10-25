import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import { formatDate } from '../lib/format';
import type { Goal, Transaction, TrashItem } from '../types';

interface Props {
  items: TrashItem[];
  onRestore: (item: TrashItem) => void;
  onPurge: () => void;
}

function describe(item: TrashItem): { title: string; detail: string } {
  if (item.entity === 'transaction') {
    const tx = item.data as Transaction;
    return { title: tx.description, detail: `Lançamento · ${formatDate(tx.date)}` };
  }
  if (item.entity === 'goal') {
    const goal = item.data as Goal;
    return { title: goal.name, detail: 'Meta e movimentos vinculados' };
  }
  return { title: item.entityId, detail: `Item · ${item.entity}` };
}

export default function TrashView({ items, onRestore, onPurge }: Props) {
  const sorted = [...items].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return <div className="page-content">
    <div className="page-title">
      <div><p className="eyebrow">RECUPERAÇÃO LOCAL</p><h1>Lixeira</h1><p className="muted">Itens excluídos ficam disponíveis por 30 dias. Restaurar um movimento de meta restaura também a meta e os outros movimentos excluídos junto.</p></div>
      {sorted.length > 0 && <div className="title-actions"><button className="btn secondary" onClick={onPurge}><Trash2 size={15}/> Esvaziar lixeira</button></div>}
    </div>
    {sorted.length ? <div className="module-grid">{sorted.map(item => {
      const description = describe(item);
      return <article className="panel receivable-row" key={item.id}>
        <span className="module-icon"><Archive size={18}/></span>
        <div><strong>{description.title}</strong><small>{description.detail}</small><small>Excluído em {formatDate(item.deletedAt.slice(0, 10))}</small></div>
        <button className="btn secondary small" onClick={() => onRestore(item)}><RotateCcw size={15}/> Restaurar</button>
      </article>;
    })}</div> : <div className="empty-state"><div className="empty-symbol"><Trash2 size={23}/></div><h3>A lixeira está vazia</h3><p>Itens excluídos aparecerão aqui para restauração.</p></div>}
  </div>;
}
