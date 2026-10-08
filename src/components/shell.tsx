'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, CalendarDays, Users, Wallet, LogOut } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { BrandMark } from './brand';
import { InstallHint } from './install-hint';
import { PushPrompt, PushToggle } from './push-control';
import { useStore, type SaveState } from './store';
import { QuickActions } from './quick-actions';
import { ReceiptAttacher } from './receipt-intake';
import { HeaderMenu } from './header-menu';
import { Avatar, squarePhoto } from './avatar';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
const nav = [
  { href: '/', label: 'Inicio', Icon: House },
  { href: '/coberturas', label: 'Coberturas', Icon: CalendarDays },
  { href: '/equipo', label: 'Equipo', Icon: Users },
  { href: '/pagos', label: 'Pagos', Icon: Wallet }
];
const saveLabel: Record<SaveState, string> = { saved: 'Cambios guardados', saving: 'Guardando…', error: 'Sin guardar, reintentando' };
function Brand(){return <Link href="/" className="brand-link" aria-label="BS Marketing, inicio"><BrandMark/></Link>}
function SaveStatus({className=''}:{className?:string}){const {saveState}=useStore();return <p role="status" className={`save-status save-${saveState} ${className}`}><span aria-hidden="true"/>{saveLabel[saveState]}</p>}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { email, signOut, photoPath, setPhotoPath } = useStore();
  // Foto de Dafne: se recorta en cuadrado, se sube a "coord-<usuario>/" y reemplaza a la anterior.
  const changePhoto = async (file: File) => {
    const id = toast.loading('Subiendo tu foto…');
    try {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Tu sesión venció. Volvé a ingresar.');
      const path = `coord-${user.id}/${crypto.randomUUID()}.jpg`;
      const { error: upError } = await supabase.storage.from('perfiles').upload(path, await squarePhoto(file), { contentType: 'image/jpeg' });
      if (upError) throw new Error('No se pudo subir la foto. Probá de nuevo.');
      const { error } = await supabase.rpc('set_my_photo', { p_path: path });
      if (error) { await supabase.storage.from('perfiles').remove([path]); throw new Error(error.message); }
      if (photoPath) await supabase.storage.from('perfiles').remove([photoPath]);
      setPhotoPath(path); toast.success('Foto actualizada', { id });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo cambiar la foto.', { id }); }
  };
  const active = (href: string) => href === '/' ? path === '/' : path.startsWith(href);
  return <div className="app-shell">
    <aside className="desktop-sidebar">
      <Brand/>
      <nav aria-label="Navegación principal" className="sidebar-nav">{nav.map(({href,label,Icon}) => <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} className="nav-item"><Icon size={20}/>{label}</Link>)}</nav>
      <ThemeToggle className="sidebar-theme"/>
      <PushToggle/>
      <div className="sidebar-footer">{photoPath?<Avatar name={email||'Dafne'} photoPath={photoPath} size={38}/>:<div className="profile-avatar">{(email[0]||'D').toUpperCase()}</div>}<div className="min-w-0 flex-1"><strong className="block truncate">{email||'Dafne'}</strong><SaveStatus/></div></div>
      <button type="button" className="theme-toggle" onClick={()=>void signOut()}><LogOut size={18}/><span>Salir</span></button>
    </aside>
    <div className="app-content"><header className="mobile-header"><Link href="/" className="brand-link" aria-label="BS Marketing, inicio"><BrandMark size={30}/></Link><HeaderMenu email={email} photoPath={photoPath} onPhoto={changePhoto} onSignOut={()=>void signOut()}/></header>
      <main className="main-content"><InstallHint/><PushPrompt/>{children}<SaveStatus className="mobile-save"/></main>
      <QuickActions/><ReceiptAttacher/>
    </div>
    <nav aria-label="Navegación principal" className="bottom-nav">{nav.map(({href,label,Icon}) => <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}><Icon size={21}/><span>{label}</span></Link>)}</nav>
  </div>;
}
