import Image from 'next/image';

/**
 * Lo que se ve mientras abre la app: el logo sobre la noche, igual a la pantalla de arranque del iPhone
 * (public/splash, de scripts/make_splash.py), así al abrir desde el ícono no hay blanco ni salto.
 */
export function BootScreen() {
  return <div className="boot" role="status" aria-label="Cargando">
    <Image src="/icons/icon-512.png" alt="" width={112} height={112} className="boot-logo" priority unoptimized/>
    <span className="boot-dots" aria-hidden><i/><i/><i/></span>
  </div>;
}
