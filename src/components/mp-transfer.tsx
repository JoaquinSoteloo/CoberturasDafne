'use client';
import { useState } from 'react';
import { Copy, Send } from 'lucide-react';
import { toast } from 'sonner';
import { ars } from '@/lib/money';

// Mercado Pago no tiene un link para abrir una transferencia ya armada. Lo más cerca: se copia
// el alias y se abre la app, que detecta el alias copiado y ofrece transferirle.
const openMercadoPago = () => {
  const ua = navigator.userAgent;
  const web = 'https://www.mercadopago.com.ar/';
  if (/android/i.test(ua)) {
    window.location.href = `intent://home#Intent;scheme=mercadopago;package=com.mercadopago.wallet;S.browser_fallback_url=${encodeURIComponent(web)};end`;
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    window.location.href = 'mercadopago://';
    // Si la app no está instalada, el celular se queda acá: se abre la web.
    setTimeout(() => { if (document.visibilityState === 'visible') window.location.href = web; }, 1500);
  } else {
    window.open(web, '_blank', 'noopener');
  }
};

// Se copia como texto simple con el método clásico (algunas apps del iPhone no leen bien lo
// copiado con el método nuevo); si no anda, se usa el nuevo.
const copyPlain = (text: string) => {
  try {
    const field = document.createElement('textarea');
    field.value = text; field.setAttribute('readonly', ''); field.style.position = 'fixed'; field.style.opacity = '0';
    document.body.appendChild(field); field.select(); field.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(field);
    return ok;
  } catch { return false; }
};
const copy = async (text: string) => {
  if (copyPlain(text)) return true;
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
};

/** Transferirle a una CM: copia su alias, abre Mercado Pago y muestra el monto para poner. */
export function MpTransfer({ name, alias, amountCents }: { name: string; alias?: string; amountCents: number }) {
  const [opened, setOpened] = useState(false);
  const first = name.split(' ')[0] || 'la CM';
  const clean = (alias ?? '').trim();
  if (!clean) return <p className="muted text-sm">Cargá el alias de {first} en Equipo para transferirle desde acá.</p>;

  // Sin puntos de miles, que es como lo pide el teclado de Mercado Pago.
  const copyAmount = async () => {
    const text = amountCents % 100 ? (amountCents / 100).toFixed(2).replace('.', ',') : String(amountCents / 100);
    if (await copy(text)) toast.success('Monto copiado'); else toast.error('No se pudo copiar el monto');
  };
  const go = async () => {
    const ok = await copy(clean);
    if (!ok) toast.error(`No se pudo copiar el alias. Copialo a mano: ${clean}`);
    else toast.success('Alias copiado. Mercado Pago te va a ofrecer transferirle.');
    setOpened(true);
    openMercadoPago();
  };

  return <div className="mp-transfer">
    <div className="min-w-0 flex-1">
      <p className="text-sm font-bold">Transferirle a {first}</p>
      <p className="muted truncate text-sm">Alias: <span className="font-semibold text-[var(--ink)]">{clean}</span></p>
      {amountCents > 0 && <p className="mt-1 text-sm">Monto: <strong className="text-base">{ars(amountCents)}</strong> <button type="button" className="text-link ml-1 inline-flex items-center gap-1" onClick={() => void copyAmount()}><Copy size={13}/> Copiar monto</button></p>}
      {opened && <p className="muted mt-1 text-xs">Si Mercado Pago no toma el alias solo: tocá “Transferir” → “Alias, CBU/CVU”, mantené apretado el campo y elegí “Pegar”.</p>}
    </div>
    <button type="button" className="btn btn-mp w-full" onClick={() => void go()}><Send size={16}/> Transferir con Mercado Pago</button>
  </div>;
}
