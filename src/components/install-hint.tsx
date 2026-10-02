'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Share, X, Download } from 'lucide-react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = 'coberturas-install-hint';

/**
 * Aviso para instalar la app en el celular. En Android usa el instalador del navegador;
 * en iPhone explica cómo hacerlo, porque Safari no tiene botón. No aparece si ya está instalada.
 */
export function InstallHint() {
  const [mode, setMode] = useState<'android' | 'ios' | null>(null);
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
    let dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === 'cerrado'; } catch { /* sin almacenamiento, se muestra */ }
    if (installed || dismissed || !window.matchMedia('(max-width: 767px)').matches) return;
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios/i.test(ua)) setMode('ios');
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent); setMode('android'); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!mode) return null;
  const close = () => { try { localStorage.setItem(KEY, 'cerrado'); } catch { /* nada */ } setMode(null); };
  const install = async () => { if (!event) return; await event.prompt(); await event.userChoice; close(); };

  return <aside className="install-hint" aria-label="Instalar la app">
    <Image src="/icons/icon-192.png" alt="" width={44} height={44}/>
    <div className="min-w-0 flex-1">
      <p className="font-bold">Instalá Coberturas en tu celular</p>
      {mode === 'ios'
        ? <p className="text-sm">Tocá <Share size={14} className="inline align-[-2px]" aria-label="Compartir"/> y después <b>Agregar a inicio</b>.</p>
        : <button type="button" className="btn btn-primary btn-small mt-2" onClick={() => void install()}><Download size={16}/> Instalar</button>}
    </div>
    <button type="button" className="install-close" onClick={close} aria-label="Cerrar aviso"><X size={18}/></button>
  </aside>;
}
