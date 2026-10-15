'use client';
import { useState } from 'react';
import { FileCheck2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { openReceipt } from '@/lib/receipts';

/** Abre el comprobante guardado de un cobro o un pago (nada si no tiene). */
export function ReceiptButton({ path }: { path?: string }) {
  const [busy, setBusy] = useState(false);
  if (!path) return null;
  return <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={async () => {
    setBusy(true);
    try { await openReceipt(supabaseBrowser(), path); } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo abrir el comprobante.'); }
    finally { setBusy(false); }
  }}><FileCheck2 size={15}/>{busy ? 'Abriendo…' : 'Comprobante'}</button>;
}
