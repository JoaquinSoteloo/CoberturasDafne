'use client';
import { useRef, useState } from 'react';
import { Paperclip, FileCheck2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { attachReceipt, openReceipt, removeReceipt } from '@/lib/receipts';

/** Adjuntar, ver, cambiar o quitar el comprobante de un gasto. */
export function ReceiptControl({ expenseId, path, onChange, disabledReason }: {
  expenseId: string; path?: string | null; onChange: (path: string | null) => void; disabledReason?: string;
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

  return <span className="receipt-control">
    <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }}/>
    {path ? <>
      <button type="button" className="btn btn-secondary btn-small" disabled={disabled} onClick={() => void run('abriendo', () => openReceipt(supabaseBrowser(), path))}><FileCheck2 size={16}/>{busy === 'abriendo' ? 'Abriendo…' : 'Ver comprobante'}</button>
      <button type="button" className="btn btn-quiet btn-small" disabled={disabled} onClick={() => input.current?.click()}><RefreshCw size={15}/>{busy === 'subiendo' ? 'Subiendo…' : 'Cambiar'}</button>
      <button type="button" className="btn btn-quiet btn-small" disabled={disabled} aria-label="Quitar comprobante" onClick={() => { if (window.confirm('¿Quitar el comprobante? El archivo se borra.')) void run('quitando', async () => { await removeReceipt(supabaseBrowser(), expenseId, path); onChange(null); toast.success('Comprobante quitado'); }); }}><Trash2 size={15}/></button>
    </> : <button type="button" className="btn btn-secondary btn-small" disabled={disabled} onClick={() => input.current?.click()}><Paperclip size={16}/>{busy === 'subiendo' ? 'Subiendo…' : 'Adjuntar comprobante'}</button>}
    {disabledReason && <span className="muted text-sm">{disabledReason}</span>}
  </span>;
}
