'use client';
import { useEffect, useRef, useState } from 'react';
import { LogOut, Smartphone } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { PushToggle } from './push-control';
import { photoUrl } from './avatar';
import { Modal } from './ui';
import { ShortcutSetup } from './shortcut-setup';

/**
 * En el celular, el círculo de arriba a la derecha (la foto o la inicial) abre un menú con lo que
 * casi no se usa: los avisos, el modo noche, el Atajo de iPhone y salir.
 */
export function HeaderMenu({ email, name, photoPath, onSignOut, who = 'coordinadora' }: { email: string; name?: string; photoPath?: string | null; onSignOut: () => void; who?: 'coordinadora' | 'cm' }) {
  const [open, setOpen] = useState(false);
  const [shortcut, setShortcut] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const photo = photoUrl(photoPath);
  return <div className="header-menu" ref={box}>
    <button type="button" className="header-avatar" aria-label="Menú" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto chica ya achicada al subirla */}
      {photo ? <img src={photo} alt="" className="header-avatar-photo"/> : (name || email || 'D')[0].toUpperCase()}
    </button>
    {open && <div className="header-menu-panel"><p className="header-menu-email">{name ? <><strong className="block text-white">{name}</strong>{email}</> : email || 'Dafne'}</p><PushToggle/><ThemeToggle/><button type="button" className="theme-toggle" onClick={() => { setOpen(false); setShortcut(true); }}><Smartphone size={18}/><span>Atajo de iPhone</span></button><button type="button" className="theme-toggle" onClick={onSignOut}><LogOut size={18}/><span>Salir</span></button></div>}
    {shortcut && <Modal title="Atajo de iPhone" onClose={() => setShortcut(false)}><ShortcutSetup who={who}/></Modal>}
  </div>;
}
