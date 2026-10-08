'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useContentTemplates } from '@/components/content-templates';
import { PARTY_TYPES } from '@/lib/domain';
import { parseChecklistIdeas } from '@/lib/checklist';
import { GENERAL, SUGGESTED } from '@/lib/templates';

const TYPES = [...PARTY_TYPES, GENERAL];
const label = (type: string) => (type === GENERAL ? 'Otras fiestas' : type);

/**
 * Listas de contenido por tipo de fiesta: cada fiesta nueva arranca con la de su tipo (y las que
 * no tienen tipo o su tipo no tiene lista, con "Otras fiestas"). En cada fiesta se ajusta después.
 */
export default function ContentTemplates() {
  const { templates, save } = useContentTemplates();
  const [type, setType] = useState<string>(TYPES[0]);
  if (!templates) return <p className="muted">Cargando listas…</p>;
  return <div className="space-y-6">
    <Link href="/coberturas" className="back-link"><ArrowLeft size={17}/> Coberturas</Link>
    <div><h1 className="page-title">Listas de contenido</h1><p className="muted mt-2">Cada fiesta nueva arranca con la lista de su tipo. Después, en cada fiesta, la ajustás.</p></div>
    <div className="template-types" role="tablist" aria-label="Tipo de fiesta">{TYPES.map(t => <button key={t} type="button" role="tab" aria-selected={type === t} className={type === t ? 'selected' : ''} onClick={() => setType(t)}>
      {label(t)}{(templates[t]?.length ?? 0) > 0 && <span className="template-count">{templates[t].length}</span>}
    </button>)}</div>
    <Editor key={type} type={type} saved={templates[type] ?? []} onSave={items => save(type, items)}/>
  </div>;
}

function Editor({ type, saved, onSave }: { type: string; saved: string[]; onSave: (items: string[]) => Promise<void> }) {
  const [items, setItems] = useState<string[]>(saved);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const changed = JSON.stringify(items.map(x => x.trim()).filter(Boolean)) !== JSON.stringify(saved);
  const add = () => { const more = parseChecklistIdeas(draft).filter(x => !items.some(i => i.toLowerCase() === x.toLowerCase())); if (more.length) setItems([...items, ...more]); setDraft(''); };
  const move = (i: number, d: number) => { const next = [...items]; [next[i], next[i + d]] = [next[i + d], next[i]]; setItems(next); };
  const store = async () => {
    setBusy(true);
    try { await onSave(items); toast.success(`Lista de ${label(type).toLowerCase()} guardada`); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  };
  return <section className="card space-y-4 p-4" aria-label={`Lista de ${label(type)}`}>
    {!items.length && SUGGESTED[type] && <div className="template-suggest">
      <p className="text-sm"><Sparkles size={15} className="mr-1 inline" aria-hidden="true"/>Una lista para arrancar: {SUGGESTED[type].join(', ')}.</p>
      <button type="button" className="btn btn-secondary btn-small" onClick={() => setItems(SUGGESTED[type])}>Usar esta lista</button>
    </div>}
    {items.length > 0 && <ol className="template-items">{items.map((text, i) => <li key={i}>
      <input className="field" value={text} aria-label={`Contenido ${i + 1}`} onChange={e => setItems(items.map((x, j) => j === i ? e.target.value : x))}/>
      <button type="button" className="btn btn-quiet btn-small !px-2" disabled={i === 0} aria-label="Subir" onClick={() => move(i, -1)}><ArrowUp size={16}/></button>
      <button type="button" className="btn btn-quiet btn-small !px-2" disabled={i === items.length - 1} aria-label="Bajar" onClick={() => move(i, 1)}><ArrowDown size={16}/></button>
      <button type="button" className="btn btn-quiet btn-small !px-2" aria-label={`Sacar ${text}`} onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={16}/></button>
    </li>)}</ol>}
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); add(); }}>
      <input className="field" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Agregar: entrada, vals, torta…" aria-label="Agregar contenido"/>
      <button type="submit" className="btn btn-secondary !px-3" aria-label="Agregar" disabled={!draft.trim()}><Plus size={18}/></button>
    </form>
    <p className="muted text-xs">Podés pegar varios juntos, separados por coma o uno por renglón.</p>
    <button type="button" className="btn btn-primary w-full" disabled={!changed || busy} onClick={() => void store()}>{busy ? 'Guardando…' : `Guardar lista de ${label(type).toLowerCase()}`}</button>
  </section>;
}
