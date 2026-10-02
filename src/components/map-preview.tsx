import { MapPin, ExternalLink } from 'lucide-react';

/** Link oficial de Google Maps: en el celular abre la app de Maps con la búsqueda. */
export const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/**
 * Mapa chico de la dirección. La vista embebida usa la forma de Google sin clave (no oficial):
 * si algún día deja de cargar, el link para abrir Google Maps sigue funcionando.
 */
export function MapPreview({ address, label }: { address: string; label?: string }) {
  if (!address.trim()) return null;
  return <a className="map-preview" href={mapsUrl(address)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${label || address} en Google Maps`}>
    <iframe
      title={`Mapa de ${label || address}`}
      src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed`}
      loading="lazy" referrerPolicy="no-referrer-when-downgrade" tabIndex={-1} aria-hidden="true"/>
    <span className="map-caption"><MapPin size={15}/><span className="min-w-0 flex-1 truncate">{address}</span><span className="map-open">Abrir en Maps <ExternalLink size={13}/></span></span>
  </a>;
}
