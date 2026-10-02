import type { Metadata } from 'next';
import { Unbounded, Figtree } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import { AppRoot } from '@/components/app-root';

const display = Unbounded({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' });
const body = Figtree({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-body' });

// Aplica el modo elegido antes de pintar, para que no parpadee.
const themeScript=`try{var t=localStorage.getItem('dafne-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata: Metadata = { title: 'Dafne · Coberturas', description: 'Gestión de coberturas de contenido' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-AR" className={`${display.variable} ${body.variable}`} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeScript}}/></head><body><AppRoot>{children}</AppRoot><Toaster position="top-center" closeButton toastOptions={{className:'dafne-toast'}}/></body></html>;
}
