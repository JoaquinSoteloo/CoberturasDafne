// Solo para el servidor: consulta Google Maps.
import type { Coords } from './maps';

const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const GOOGLE = /(^|\.)(google\.[a-z.]{2,8}|goo\.gl|g\.co)$/;

const coords = (lat: string, lng: string): Coords | null => {
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0) ? { lat: a, lng: b } : null;
};

/** Lee el lugar de la página del mapa embebido: `"<id>","<nombre>",[lat,lng],"<cid>"`; si no, el centro de la vista. */
export function placeFromEmbedHtml(html: string): Coords | null {
  const place = html.match(/",\[(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)\],"\d+"/);
  if (place) return coords(place[1], place[2]);
  const view = html.match(/\[\[\[[\d.]+,(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)\]/);
  return view ? coords(view[2], view[1]) : null;
}

/**
 * Busca un lugar o una dirección en Google Maps y devuelve sus coordenadas, usando la misma
 * vista embebida sin clave que muestra la app. No es una API oficial: si Google la cambia,
 * devuelve null y queda pegar el link a mano.
 */
export async function lookupPlace(query: string): Promise<Coords | null> {
  const response = await fetch(`https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`, {
    headers: { 'User-Agent': BROWSER, 'Accept-Language': 'es-AR,es;q=0.9' }, signal: AbortSignal.timeout(8000)
  });
  if (!response.ok || !GOOGLE.test(new URL(response.url).hostname)) return null;
  return placeFromEmbedHtml((await response.text()).slice(0, 500_000));
}

/** Sigue las redirecciones de un link corto (solo dentro de Google) y devuelve el link final. */
export async function expandShortLink(link: string): Promise<string | null> {
  let url = link;
  for (let hop = 0; hop < 6; hop++) {
    const response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': BROWSER }, signal: AbortSignal.timeout(8000) });
    const next = response.headers.get('location');
    if (!next) return url;
    url = new URL(next, url).toString();
    if (!url.startsWith('https://') || !GOOGLE.test(new URL(url).hostname)) return null;
  }
  return url;
}
