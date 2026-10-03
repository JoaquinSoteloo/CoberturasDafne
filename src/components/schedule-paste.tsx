'use client';
import { useState } from 'react';
import { ClipboardPaste, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { parseSchedule, type ParsedMoment } from '@/lib/schedule';

/**
 * Pegar el cronograma que manda el salón. Primero se lee en el celular; si no se entiende
 * nada, o quedan líneas sin leer y Dafne lo pide, se ordena con IA.
 * `onImport` agrega los momentos (reemplazando los de la carga anterior) y devuelve sus ids.
 */
export function SchedulePaste({ open, onImport }: { open: boolean; onImport: (items: ParsedMoment[], replace: string[]) => string[] }) {
  const [text, setText] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);
  const [lastIds, setLastIds] = useState<string[]>([]);
  const [lastText, setLastText] = useState('');
  const [busy, setBusy] = useState(false);
  // Abierto de entrada si todavía no hay cronograma; después lo maneja Dafne.
  const [expanded, setExpanded] = useState(open);

  const withAi = async (source: string, replace: string[]) => {
    setBusy(true);
    try {
      const res = await fetch('/api/schedule-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: source }) });
      const data = await res.json().catch(() => ({})) as { items?: ParsedMoment[]; error?: string };
      if (!res.ok) { toast.error(data.error || 'No se pudo leer el cronograma.'); return; }
      if (!data.items?.length) { toast.error('No encontré horarios en ese texto.'); return; }
      setLastIds(onImport(data.items, replace)); setSkipped([]); setText('');
      toast.success(`Cargados ${data.items.length} momentos con IA. Revisalos antes de guardar.`);
    } catch { toast.error('Sin conexión. Probá de nuevo.'); }
    finally { setBusy(false); }
  };

  const load = async () => {
    const source = text.trim();
    if (!source) return;
    setLastText(source);
    const { items, skipped } = parseSchedule(source);
    if (!items.length) { await withAi(source, []); return; }
    setLastIds(onImport(items, [])); setSkipped(skipped); setText('');
    toast.success(`Cargados ${items.length} momentos.`);
  };

  return <details className="schedule-paste" open={expanded} onToggle={e => setExpanded((e.currentTarget as HTMLDetailsElement).open)}>
    <summary className="cursor-pointer font-bold"><ClipboardPaste size={17}/> Pegar el cronograma del salón</summary>
    <div className="mt-3 space-y-3">
      <textarea className="field min-h-32" value={text} onChange={e => setText(e.target.value)} placeholder={'Pegá acá el mensaje, por ejemplo:\n21:30 Recepción\n23 hs Vals\nTorta 01:00'} aria-label="Cronograma del salón"/>
      <button type="button" className="btn btn-secondary" disabled={busy || !text.trim()} onClick={() => void load()}>{busy ? 'Leyendo…' : 'Cargar momentos'}</button>
      {skipped.length > 0 && <div className="schedule-skipped" role="status">
        <p className="text-sm"><strong>No entendí {skipped.length === 1 ? 'esta línea' : `estas ${skipped.length} líneas`}:</strong></p>
        <ul className="muted text-sm">{skipped.slice(0, 5).map((l, i) => <li key={i}>“{l}”</li>)}</ul>
        <p className="muted text-sm">Si son títulos o saludos, está bien. Si son momentos, ordená todo con IA.</p>
        <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => void withAi(lastText, lastIds)}><Sparkles size={15}/> {busy ? 'Ordenando…' : 'Ordenar todo con IA'}</button>
      </div>}
    </div>
  </details>;
}
