import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Toaster } from 'sonner';
import { AppRoot } from '@/components/app-root';
import { ServiceWorker } from '@/components/service-worker';

// Tipografías guardadas en el proyecto (licencia OFL): compilar no depende de Google Fonts,
// que a veces responde con direcciones que rompen next/font en Vercel.
const display = localFont({ src: './fonts/unbounded-latin.woff2', weight: '500 700', variable: '--font-display', display: 'swap' });
const body = localFont({ src: './fonts/figtree-latin.woff2', weight: '400 800', variable: '--font-body', display: 'swap' });

// Aplica el modo elegido antes de pintar, para que no parpadee.
const themeScript=`try{var t=localStorage.getItem('dafne-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata: Metadata = {
  title: 'BS Marketing',
  description: 'Fiestas, equipo, cobros y pagos de las coberturas de contenido.',
  applicationName: 'BS Marketing',
  // En iPhone, instalada desde "Agregar a inicio": pantalla completa con la barra de estado sobre el índigo.
  appleWebApp: { capable: true, title: 'BS Marketing', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false }
};
export const viewport: Viewport = {
  themeColor: '#22183d',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-AR" className={`${display.variable} ${body.variable}`} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeScript}}/></head><body><AppRoot>{children}</AppRoot><ServiceWorker/><Toaster position="top-center" closeButton toastOptions={{className:'dafne-toast'}}/></body></html>;
}
