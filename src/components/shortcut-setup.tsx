'use client';
import { useEffect, useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';

/**
 * Armar el Atajo de iPhone: el link privado de la cuenta y los pasos en la app Atajos. Con el
 * Atajo, desde la pantalla de un comprobante se toca Compartir → "BS Marketing" y listo.
 */
export function ShortcutSetup({ who }: { who: 'coordinadora' | 'cm' }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const fetchToken = async (fresh = false) => {
    const { data, error } = await supabaseBrowser().rpc('my_intake_token', { p_new: fresh });
    if (error || typeof data !== 'string') { setError('No se pudo traer el link. Probá de nuevo.'); return; }
    setToken(data); setError('');
  };
  useEffect(() => { void fetchToken(); }, []);
  const url = token ? `${window.location.origin}/api/atajo/${token}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); toast.success('Link copiado'); setTimeout(() => setCopied(false), 2500); }
    catch { toast.error('No se pudo copiar. Mantené apretado el link y elegí Copiar.'); }
  };
  const renew = async () => {
    if (!window.confirm('Se crea un link nuevo y el Atajo que ya tenés deja de andar hasta que le pegues el nuevo. ¿Seguimos?')) return;
    await fetchToken(true); toast.success('Link nuevo listo');
  };

  return <div className="space-y-5">
    <p>{who === 'coordinadora'
      ? 'Desde la pantalla de un comprobante (Mercado Pago, el banco o WhatsApp) tocás Compartir → BS Marketing y la app lo registra sola, sin abrirla. Si tiene dudas, te lo deja en "A resolver".'
      : 'Desde el recibo de tu Uber tocás Compartir → BS Marketing y se carga solo en la fiesta que corresponde. Dafne recibe el aviso.'}</p>
    <div className="shortcut-link">
      <p className="text-sm font-bold">Tu link privado</p>
      {error ? <p role="alert" className="field-error">{error}</p> : <p className="shortcut-url">{url || 'Cargando…'}</p>}
      <button type="button" className="btn btn-primary w-full" disabled={!url} onClick={() => void copy()}>{copied ? <Check size={17}/> : <Copy size={17}/>}{copied ? 'Copiado' : 'Copiar link'}</button>
      <p className="muted text-xs">No lo compartas: con este link se pueden cargar comprobantes a tu nombre.</p>
    </div>
    <ol className="shortcut-steps">
      <li>Abrí la app <b>Atajos</b> del iPhone y tocá <b>+</b>.</li>
      <li>Arriba, tocá el nombre y poné <b>BS Marketing</b>.</li>
      <li>Tocá <b>Agregar acción</b>, buscá <b>Obtener contenido de la URL</b> y elegila.</li>
      <li>Tocá donde dice <b>URL</b> y pegá el link.</li>
      <li>Tocá la flechita de esa acción: en <b>Método</b> elegí <b>POST</b>, en <b>Cuerpo de la solicitud</b> elegí <b>Archivo</b> y en <b>Archivo</b> elegí <b>Entrada del atajo</b>.</li>
      <li>Agregá la acción <b>Mostrar notificación</b> y adentro poné <b>Contenido de la URL</b>.</li>
      <li>Tocá la <b>ⓘ</b> de abajo, activá <b>Mostrar en hoja para compartir</b> y en los tipos dejá solo <b>Imágenes</b> y <b>PDF</b>.</li>
      <li>Tocá <b>OK</b>. Para probarlo, abrí {who === 'coordinadora' ? 'un comprobante' : 'el recibo de un Uber'}, tocá <b>Compartir</b> y elegí <b>BS Marketing</b>.</li>
    </ol>
    <button type="button" className="btn btn-quiet btn-small" onClick={() => void renew()}><RefreshCw size={15}/> Crear un link nuevo</button>
  </div>;
}
