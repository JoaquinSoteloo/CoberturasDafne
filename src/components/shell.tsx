'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { House, CalendarDays, Users, Wallet, LogOut } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { BrandMark } from './brand';
import { InstallHint } from './install-hint';
import { PushPrompt, PushToggle } from './push-control';
import { useStore, type SaveState } from './store';
import { QuickActions } from './quick-actions';
const nav = [
  { href: '/', label: 'Inicio', Icon: House },
  { href: '/coberturas', label: 'Coberturas', Icon: CalendarDays },
  { href: '/equipo', label: 'Equipo', Icon: Users },
  { href: '/pagos', label: 'Pagos', Icon: Wallet }
];
const saveLabel: Record<SaveState, string> = { saved: 'Cambios guardados', saving: 'Guardando…', error: 'Sin guardar, reintentando' };
function Brand(){return <Link href="/" className="brand-link" aria-label="BS Marketing, inicio"><BrandMark/></Link>}
function SaveStatus({className=''}:{className?:string}){const {saveState}=useStore();return <p role="status" className={`save-status save-${saveState} ${className}`}><span aria-hidden="true"/>{saveLabel[saveState]}</p>}

/** En el celular: la inicial de Dafne abre un menú con los avisos, el modo noche y salir (casi no se usan). */
function HeaderMenu(){
  const {email,signOut}=useStore();const [open,setOpen]=useState(false);const box=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!open)return;
    const away=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false)};const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};
    document.addEventListener('pointerdown',away);document.addEventListener('keydown',esc);
    return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',esc)};},[open]);
  return <div className="header-menu" ref={box}>
    <button type="button" className="header-avatar" aria-label="Menú" aria-expanded={open} onClick={()=>setOpen(o=>!o)}>{(email[0]||'D').toUpperCase()}</button>
    {open&&<div className="header-menu-panel"><p className="header-menu-email">{email||'Dafne'}</p><PushToggle/><ThemeToggle/><button type="button" className="theme-toggle" onClick={()=>void signOut()}><LogOut size={18}/><span>Salir</span></button></div>}
  </div>;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { email, signOut } = useStore();
  const active = (href: string) => href === '/' ? path === '/' : path.startsWith(href);
  return <div className="app-shell">
    <aside className="desktop-sidebar">
      <Brand/>
      <nav aria-label="Navegación principal" className="sidebar-nav">{nav.map(({href,label,Icon}) => <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} className="nav-item"><Icon size={20}/>{label}</Link>)}</nav>
      <ThemeToggle className="sidebar-theme"/>
      <PushToggle/>
      <div className="sidebar-footer"><div className="profile-avatar">{(email[0]||'D').toUpperCase()}</div><div className="min-w-0 flex-1"><strong className="block truncate">{email||'Dafne'}</strong><SaveStatus/></div></div>
      <button type="button" className="theme-toggle" onClick={()=>void signOut()}><LogOut size={18}/><span>Salir</span></button>
    </aside>
    <div className="app-content"><header className="mobile-header"><Link href="/" className="brand-link" aria-label="BS Marketing, inicio"><BrandMark size={30}/></Link><HeaderMenu/></header>
      <main className="main-content"><InstallHint/><PushPrompt/>{children}<SaveStatus className="mobile-save"/></main>
      <QuickActions/>
    </div>
    <nav aria-label="Navegación principal" className="bottom-nav">{nav.map(({href,label,Icon}) => <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}><Icon size={21}/><span>{label}</span></Link>)}</nav>
  </div>;
}
