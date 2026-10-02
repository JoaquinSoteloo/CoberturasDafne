'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, CalendarDays, Users, Wallet } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
const nav = [
  { href: '/', label: 'Inicio', Icon: House },
  { href: '/coberturas', label: 'Coberturas', Icon: CalendarDays },
  { href: '/equipo', label: 'Equipo', Icon: Users },
  { href: '/pagos', label: 'Pagos', Icon: Wallet }
];
function Brand(){return <Link href="/" className="brand" aria-label="Dafne, inicio"><span className="brand-word">dafne<span className="brand-flash" aria-hidden="true"/></span><span className="brand-caption">coberturas</span></Link>}
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const active = (href: string) => href === '/' ? path === '/' : path.startsWith(href);
  return <div className="app-shell">
    <aside className="desktop-sidebar">
      <Brand/>
      <nav aria-label="Navegación principal" className="sidebar-nav">{nav.map(({href,label,Icon}) => <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} className="nav-item"><Icon size={20}/>{label}</Link>)}</nav>
      <ThemeToggle className="sidebar-theme"/>
      <div className="sidebar-footer"><div className="profile-avatar">D</div><div><strong>Dafne</strong><span>Coordinadora</span></div></div>
      <p className="demo-caption">Modo demo. Los datos se guardan solo en este dispositivo.</p>
    </aside>
    <div className="app-content"><header className="mobile-header"><Brand/><div className="flex items-center gap-2"><ThemeToggle className="header-theme"/><span className="profile-avatar">D</span></div></header>
      <main className="main-content">{children}<p className="mobile-demo">Modo demo. Los datos se guardan solo en este dispositivo.</p></main>
    </div>
    <nav aria-label="Navegación principal" className="bottom-nav">{nav.map(({href,label,Icon}) => <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}><Icon size={21}/><span>{label}</span></Link>)}</nav>
  </div>;
}
