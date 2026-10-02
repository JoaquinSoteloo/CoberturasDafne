'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, CalendarDays, Users, Wallet, LogOut } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { useStore, type SaveState } from './store';
const nav = [
  { href: '/', label: 'Inicio', Icon: House },
  { href: '/coberturas', label: 'Coberturas', Icon: CalendarDays },
  { href: '/equipo', label: 'Equipo', Icon: Users },
  { href: '/pagos', label: 'Pagos', Icon: Wallet }
];
const saveLabel: Record<SaveState, string> = { saved: 'Cambios guardados', saving: 'Guardando…', error: 'Sin guardar, reintentando' };
function Brand(){return <Link href="/" className="brand" aria-label="Dafne, inicio"><span className="brand-word">dafne<span className="brand-flash" aria-hidden="true"/></span><span className="brand-caption">coberturas</span></Link>}
function SaveStatus({className=''}:{className?:string}){const {saveState}=useStore();return <p role="status" className={`save-status save-${saveState} ${className}`}><span aria-hidden="true"/>{saveLabel[saveState]}</p>}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { email, signOut } = useStore();
  const active = (href: string) => href === '/' ? path === '/' : path.startsWith(href);
  return <div className="app-shell">
    <aside className="desktop-sidebar">
      <Brand/>
      <nav aria-label="Navegación principal" className="sidebar-nav">{nav.map(({href,label,Icon}) => <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} className="nav-item"><Icon size={20}/>{label}</Link>)}</nav>
      <ThemeToggle className="sidebar-theme"/>
      <div className="sidebar-footer"><div className="profile-avatar">{(email[0]||'D').toUpperCase()}</div><div className="min-w-0 flex-1"><strong className="block truncate">{email||'Dafne'}</strong><SaveStatus/></div></div>
      <button type="button" className="theme-toggle" onClick={()=>void signOut()}><LogOut size={18}/><span>Salir</span></button>
    </aside>
    <div className="app-content"><header className="mobile-header"><Brand/><div className="flex items-center gap-1"><ThemeToggle className="header-theme"/><button type="button" className="theme-toggle header-theme" onClick={()=>void signOut()} aria-label="Salir"><LogOut size={18}/><span>Salir</span></button></div></header>
      <main className="main-content">{children}<SaveStatus className="mobile-save"/></main>
    </div>
    <nav aria-label="Navegación principal" className="bottom-nav">{nav.map(({href,label,Icon}) => <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}><Icon size={21}/><span>{label}</span></Link>)}</nav>
  </div>;
}
