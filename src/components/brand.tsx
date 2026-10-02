import Image from 'next/image';

/** Logo (monograma de serpiente) + "dafne coberturas". `size` es el lado del logo en píxeles. */
export function BrandMark({ size = 38 }: { size?: number }) {
  return <span className="brand">
    <Image src="/logo.png" alt="" width={size} height={size} className="brand-logo" priority/>
    <span className="brand-text"><span className="brand-word">dafne</span><span className="brand-caption">coberturas</span></span>
  </span>;
}
