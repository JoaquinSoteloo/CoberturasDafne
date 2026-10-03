'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { shrink } from '@/lib/receipts';
import { handOffTransfer } from '@/lib/transfer-handoff';
import type { TransferData } from '@/lib/transfer';

/**
 * "Cargar comprobante" a mano desde cualquier pantalla: lee la transferencia con IA y lleva a
 * Pagos con el cobro (o el pago) ya completo: de qué fiesta es por el importe y la fecha.
 */
export function QuickTransfer() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const small = await shrink(file);
      const body = new FormData(); body.append('file', new File([small], file.name, { type: small.type || file.type }));
      const res = await fetch('/api/transfer-scan', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'No se pudo leer el comprobante.'); return; }
      if (!(data as TransferData).isTransfer) { toast.error('No parece el comprobante de una transferencia. Revisá el archivo.'); return; }
      handOffTransfer(file, data as TransferData);
      router.push('/pagos?comprobante=1');
    } catch { toast.error('No se pudo leer el comprobante. Probá de nuevo.'); }
    finally { setBusy(false); }
  };
  return <>
    <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }}/>
    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => input.current?.click()}><Receipt size={16}/>{busy ? 'Leyendo comprobante…' : 'Cargar comprobante'}</button>
  </>;
}
