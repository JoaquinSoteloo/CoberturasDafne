export type Coords = { lat: number; lng: number };

const valid = (lat: number, lng: number): Coords | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null;
const pair = (text: string | null | undefined) => {
  const m = text?.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  return m ? valid(Number(m[1]), Number(m[2])) : null;
};

/**
 * Coordenadas de un link de Google Maps (o de Apple Maps, o "lat, lng" pegado directo).
 * Prefiere el pin del lugar (!3d…!4d…) antes que el centro de la vista (@lat,lng).
 * Los links cortos (maps.app.goo.gl) no traen coordenadas: hay que abrirlos en el servidor.
 */
export function coordsFromText(text: string): Coords | null {
  const raw = text.trim();
  const direct = pair(raw);
  if (direct) return direct;
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* se usa tal cual */ }
  const pin = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pin) return valid(Number(pin[1]), Number(pin[2]));
  try {
    const url = new URL(raw);
    for (const key of ['q', 'query', 'll', 'sll', 'center', 'coordinate', 'destination', 'daddr']) {
      const found = pair(url.searchParams.get(key));
      if (found) return found;
    }
  } catch { /* no es un link */ }
  const view = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$)/);
  return view ? valid(Number(view[1]), Number(view[2])) : null;
}

const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co']);
/** ¿Es un link corto de Google Maps que hay que abrir para ver las coordenadas? */
export function isShortMapsLink(text: string) {
  try { const url = new URL(text.trim()); return url.protocol === 'https:' && SHORT_HOSTS.has(url.hostname); } catch { return false; }
}

/** Link oficial de Google Maps: en el celular abre la app de Maps. */
export const mapsSearchUrl = (address: string, coords?: Coords | null) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords ? `${coords.lat},${coords.lng}` : address)}`;

/** Abre Uber con origen "tu ubicación" y el destino cargado (Uber necesita las coordenadas). */
export function uberUrl(coords: Coords, nickname: string, address: string) {
  const params = new URLSearchParams({
    action: 'setPickup', pickup: 'my_location',
    'dropoff[latitude]': String(coords.lat), 'dropoff[longitude]': String(coords.lng),
    'dropoff[nickname]': nickname || address, 'dropoff[formatted_address]': address
  });
  return `https://m.uber.com/ul/?${params.toString()}`;
}
