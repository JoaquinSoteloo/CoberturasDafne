'use client';
import { useState } from 'react';
import { Check, ExternalLink, MapPinned } from 'lucide-react';
import { coordsFromText, extractLink, mapsSearchUrl, type Coords } from '@/lib/maps';

/**
 * Fijar la ubicación exacta de un salón pegando el link de Google Maps (Compartir > Copiar link).
 * Uber la necesita para abrirse con el destino cargado.
 */
export function SalonLocationField({ address, coords, onChange }: { address: string; coords: Coords | null; onChange: (coords: Coords | null) => void }) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const resolve = async (payload: { url: string } | { address: string }) => {
    setBusy(true);
    try {
      const response = await fetch('/api/maps-location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo leer la ubicación.');
      onChange({ lat: data.lat, lng: data.lng }); setLink('');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer la ubicación.'); }
    finally { setBusy(false); }
  };
  const fix = (value = link) => {
    if (!value.trim()) return;
    setError('');
    const local = coordsFromText(extractLink(value));
    if (local) { onChange(local); setLink(''); return; }
    return resolve({ url: value });
  };
  const fromAddress = () => { setError(''); return resolve({ address }); };

  return <fieldset className="space-y-2">
    <legend className="label">Ubicación en Google Maps</legend>
    {coords
      ? <p className="location-set"><Check size={16}/> Ubicación fijada. <a className="text-link" href={mapsSearchUrl(address, coords)} target="_blank" rel="noopener noreferrer">Verla en Maps</a> <button type="button" className="text-link" onClick={() => onChange(null)}>Quitar</button></p>
      : <p className="muted text-sm">Sirve para que &quot;Pedir Uber&quot; deje en la puerta. Ubicalo con la dirección cargada, o pegá el link que da <b>Compartir</b> en Google Maps.</p>}
    {!coords && address.trim() && <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => void fromAddress()}><MapPinned size={15}/> {busy ? 'Buscando…' : 'Ubicar con la dirección'}</button>}
    <div className="flex gap-2">
      <input className="field" type="url" inputMode="url" placeholder="Pegá acá el link de Google Maps" value={link} aria-invalid={!!error}
        onChange={e => { setLink(e.target.value); setError(''); }}
        onPaste={e => { const pasted = e.clipboardData.getData('text'); if (pasted) { e.preventDefault(); setLink(pasted); void fix(pasted); } }}
        onBlur={() => { if (link.trim() && !busy) void fix(); }}/>
      <button type="button" className="btn btn-secondary" disabled={!link.trim() || busy} onClick={() => void fix()}>{busy ? 'Leyendo…' : coords ? 'Cambiar' : 'Fijar'}</button>
    </div>
    {error && <p role="alert" className="field-error">{error}</p>}
    {address.trim() && <a className="text-link inline-flex items-center gap-1" href={mapsSearchUrl(address)} target="_blank" rel="noopener noreferrer"><MapPinned size={15}/> Buscar &quot;{address.split(',')[0]}&quot; en Maps <ExternalLink size={13}/></a>}
  </fieldset>;
}
