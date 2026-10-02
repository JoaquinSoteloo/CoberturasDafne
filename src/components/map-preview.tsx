import Link from 'next/link';
import { MapPin, ExternalLink, Car } from 'lucide-react';
import { mapsSearchUrl, uberUrl, type Coords } from '@/lib/maps';

/**
 * Mapa chico de la dirección, con "Abrir en Maps" y, si el salón tiene la ubicación fijada,
 * "Pedir Uber" con el destino cargado. La vista embebida usa la forma de Google sin clave
 * (no oficial): si algún día deja de cargar, los botones siguen funcionando.
 */
export function MapPreview({ address, label, coords, fixLocationHref }: {
  address: string; label?: string; coords?: Coords | null;
  /** Para la coordinadora: adónde ir a fijar la ubicación si falta. */
  fixLocationHref?: string;
}) {
  if (!address.trim() && !coords) return null;
  // Con la dirección, el mapa de Google dibuja el pin; con coordenadas, no. Las coordenadas quedan para Uber.
  const query = address.trim() || (coords ? `${coords.lat},${coords.lng}` : '');
  const maps = mapsSearchUrl(address, coords);
  return <div className="map-preview">
    <a href={maps} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true" className="map-frame">
      <iframe title={`Mapa de ${label || address}`} src={`https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" tabIndex={-1}/>
    </a>
    <div className="map-caption"><MapPin size={15}/><span className="min-w-0 flex-1 truncate">{address || label}</span></div>
    <div className="map-actions">
      <a className="btn btn-secondary btn-small" href={maps} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Abrir en Maps</a>
      {coords
        ? <a className="btn btn-uber btn-small" href={uberUrl(coords, label || address, address)} target="_blank" rel="noopener noreferrer"><Car size={15}/> Pedir Uber</a>
        : fixLocationHref && <Link className="text-link" href={fixLocationHref}>Fijá la ubicación del salón para pedir Uber</Link>}
    </div>
  </div>;
}
