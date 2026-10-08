'use client';
import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { Modal } from './ui';

const VIEW = 280;   // lado del recuadro en pantalla
const OUT = 512;    // lado de la foto guardada (queda en unos 60 KB)
const MAX_ZOOM = 5; // cuánto se puede acercar, sobre el mínimo que llena el círculo
type View = { x: number; y: number; s: number };

/**
 * Acomodar la foto de perfil en el círculo: se mueve con el dedo, se acerca con dos dedos (o la
 * barra, o la rueda del mouse) y se guarda lo que queda adentro, cuadrado de 512 px en JPG.
 */
export function PhotoCropper({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (blob: Blob) => void | Promise<void> }) {
  const [url, setUrl] = useState('');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>({ x: 0, y: 0, s: 1 });
  const [min, setMin] = useState(1);
  const [busy, setBusy] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    const src = URL.createObjectURL(file); setUrl(src); setError('');
    const i = new Image();
    i.onload = () => {
      if (!live) return;
      // Lo mínimo es que la foto llene el recuadro; arranca centrada.
      const m = Math.max(VIEW / i.naturalWidth, VIEW / i.naturalHeight);
      setMin(m); setView({ s: m, x: (VIEW - i.naturalWidth * m) / 2, y: (VIEW - i.naturalHeight * m) / 2 }); setImg(i);
    };
    i.onerror = () => { if (live) setError('No se pudo abrir esa foto. Probá con otra (una captura o una foto de la galería).'); };
    i.src = src;
    return () => { live = false; URL.revokeObjectURL(src); };
  }, [file]);

  // La foto siempre tapa todo el recuadro: no se puede correr de más.
  const clamp = (v: View): View => {
    if (!img) return v;
    const w = img.naturalWidth * v.s, h = img.naturalHeight * v.s;
    return { s: v.s, x: Math.min(0, Math.max(VIEW - w, v.x)), y: Math.min(0, Math.max(VIEW - h, v.y)) };
  };
  // Acercar o alejar manteniendo quieto el punto (cx, cy) del recuadro.
  const zoomTo = (target: number, cx = VIEW / 2, cy = VIEW / 2) => setView(v => {
    const s = Math.min(min * MAX_ZOOM, Math.max(min, target)); const k = s / v.s;
    return clamp({ s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
  });
  const local = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const down = (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, local(e)); pinch.current = null; };
  const move = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId); if (!prev) return;
    const now = local(e); pointers.current.set(e.pointerId, now);
    const all = [...pointers.current.values()];
    if (all.length === 1) { setView(v => clamp({ ...v, x: v.x + now.x - prev.x, y: v.y + now.y - prev.y })); return; }
    const [a, b] = all; const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch.current) { const ratio = dist / pinch.current; setView(v => { const s = Math.min(min * MAX_ZOOM, Math.max(min, v.s * ratio)); const k = s / v.s; const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2; return clamp({ s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }); }); }
    pinch.current = dist;
  };
  const up = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); pinch.current = null; };

  const save = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = OUT;
      canvas.getContext('2d')!.drawImage(img, -view.x / view.s, -view.y / view.s, VIEW / view.s, VIEW / view.s, 0, 0, OUT, OUT);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (!blob) throw new Error();
      await onDone(blob);
    } catch { setError('No se pudo preparar la foto. Probá de nuevo.'); }
    finally { setBusy(false); }
  };

  return <Modal title="Acomodá tu foto" onClose={onCancel}><div className="space-y-4">
    {error ? <p role="alert" className="field-error">{error}</p> : <>
      <div ref={box} className="cropper" style={{ width: VIEW, height: VIEW }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onWheel={e => { const p = local(e); zoomTo(view.s * (e.deltaY < 0 ? 1.1 : 1 / 1.1), p.x, p.y); }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- foto elegida en el celular, todavía no subida */}
        {img && <img src={url} alt="" draggable={false} style={{ width: img.naturalWidth * view.s, height: img.naturalHeight * view.s, transform: `translate(${view.x}px, ${view.y}px)` }}/>}
        <span className="cropper-ring" aria-hidden="true"/>
      </div>
      <div className="flex items-center gap-3"><ZoomOut size={18} className="shrink-0 text-[var(--muted)]" aria-hidden="true"/>
        <input type="range" className="flex-1" min={min} max={min * MAX_ZOOM} step={min / 100} value={view.s} aria-label="Acercar" onChange={e => zoomTo(Number(e.target.value))}/>
        <ZoomIn size={18} className="shrink-0 text-[var(--muted)]" aria-hidden="true"/></div>
      <p className="muted text-center text-sm">Mové la foto con el dedo y acercala con dos dedos.</p>
    </>}
    <div className="grid gap-2">
      {!error && <button type="button" className="btn btn-primary w-full" disabled={!img || busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Usar esta foto'}</button>}
      <button type="button" className="btn btn-quiet w-full" onClick={onCancel}>Cancelar</button>
    </div>
  </div></Modal>;
}
