'use client';
import { useRef, useState } from 'react';
import { Paperclip, FileCheck2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { attachReceipt, deleteCmUber, openReceipt, removeReceipt } from '@/lib/receipts';

/**
 * Adjuntar, ver, cambiar o quitar el comprobante de un gasto.
 * Para la CM (`cm`): si ya tiene algún pago, solo puede verlo; si el Uber lo cargó ella, quitar
 * el comprobante borra el Uber entero; si lo cargó Dafne, puede cambiarlo pero no quitarlo.
 */
export function ReceiptControl({ expenseId, path, onChange, disabledReason, cm }: {
  expenseId: string; path?: string | null; onChange: (path: string | null) => void; disabledReason?: string;
  cm?: { paid: boolean; loadedByCm: boolean };
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'' | 'subiendo' | 'abriendo' | 'quitando'>('');
  const run = async (state: typeof busy, task: () => Promise<void>) => {
    setBusy(state);
    try { await task(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Algo salió mal. Probá de nuevo.'); }
    finally { setBusy(''); }
  };
  const pick = (file?: File) => file && run('subiendo', async () => {
    const next = await attachReceipt(supabaseBrowser(), expenseId, file, path);
    onChange(next); toast.success(path ? 'Comprobante cambiado' : 'Comprobante adjuntado');
  });
  const disabled = !!busy || !!disabledReason;
  const locked = !!cm?.paid;
  const canRemove = !cm || cm.loadedByCm;
  const remove = () => {
    if (!path) return;
    if (cm) {
      if (window.confirm('¿Borrar este Uber? Se borra junto con el comprobante y le avisamos a Dafne.')) void run('quitando', async () => { await deleteCmUber(supabaseBrowser(), expenseId); onChange(null); toast.success('Uber borrado'); });
      return;
    }
    if (window.confirm('¿Quitar el comprobante? El archivo se borra.')) void run('quitando', async () => { await removeReceipt(supabaseBrowser(), expenseId, path); onChange(null); toast.success('Comprobante quitado'); });
  };

  return <span className="receipt-control">
    <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }}/>
    {path ? <>
      <button type="button" className="btn btn-secondary btn-small" disabled={disabled} onClick={() => void run('abriendo', () => openReceipt(supabaseBrowser(), path))}><FileCheck2 size={16}/>{busy === 'abriendo' ? 'Abriendo…' : 'Ver comprobante'}</button>
      {!locked && <button type="button" className="btn btn-quiet btn-small" disabled={disabled} onClick={() => input.current?.click()}><RefreshCw size={15}/>{busy === 'subiendo' ? 'Subiendo…' : 'Cambiar'}</button>}
      {!locked && canRemove && <button type="button" className="btn btn-quiet btn-small" disabled={disabled} aria-label={cm ? 'Borrar Uber' : 'Quitar comprobante'} onClick={remove}><Trash2 size={15}/>{busy === 'quitando' ? (cm ? 'Borrando…' : 'Quitando…') : cm ? 'Borrar Uber' : ''}</button>}
    </> : !locked && <button type="button" className="btn btn-secondary btn-small" disabled={disabled} onClick={() => input.current?.click()}><Paperclip size={16}/>{busy === 'subiendo' ? 'Subiendo…' : 'Adjuntar comprobante'}</button>}
    {locked && <span className="muted text-sm">{path ? 'Ya está pago: si hay algo mal, avisale a Dafne.' : 'Ya está pago.'}</span>}
    {disabledReason && <span className="muted text-sm">{disabledReason}</span>}
  </span>;
}
