/** Pronóstico para las horas de una fiesta, con Open-Meteo (gratis, sin clave). */

// Si el salón no tiene ubicación fijada, el pronóstico de Buenos Aires alcanza para la zona.
export const FALLBACK = { lat: -34.6037, lng: -58.3816 };
/** Se muestra desde 5 días antes: más lejos, el pronóstico no es confiable. */
export const DAYS_AHEAD = 5;

export type Hourly = { time: string[]; temperature_2m: number[]; precipitation_probability: (number | null)[]; weather_code: number[]; wind_speed_10m: number[] };
export type PartyWeather = { icon: string; label: string; tempStart: number; tempEnd: number; rainChance: number; windMax: number; tips: string[] };

// Suma horas a una hora local "AAAA-MM-DDTHH:MM" sin pasar por la zona horaria de la compu.
const plusHours = (local: string, hours: number) => {
  const d = new Date(Date.UTC(+local.slice(0, 4), +local.slice(5, 7) - 1, +local.slice(8, 10), +local.slice(11, 13) + hours, +local.slice(14, 16)));
  return d.toISOString().slice(0, 16);
};
const addDay = (day: string, n: number) => { const d = new Date(`${day}T12:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function forecastUrl(lat: number, lng: number, startsAt: string): string {
  const day = startsAt.slice(0, 10);
  const params = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lng.toFixed(4),
    hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m',
    timezone: 'America/Argentina/Buenos_Aires', start_date: day, end_date: addDay(day, 1),
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

/** Si la fiesta está entre hoy y los próximos días, cuando el pronóstico sirve. */
export function showWeather(startsAt: string, now = new Date()): boolean {
  const start = new Date(startsAt).getTime(), diff = start - now.getTime();
  return diff > -3 * 3600_000 && diff < DAYS_AHEAD * 24 * 3600_000;
}

// Códigos WMO que usa Open-Meteo: cuanto más alto, peor el tiempo.
function describe(code: number): { icon: string; label: string } {
  if (code >= 95) return { icon: '⛈️', label: 'Tormenta' };
  if (code >= 80) return { icon: '🌦️', label: 'Chaparrones' };
  if (code >= 71) return { icon: '🌨️', label: 'Nieve' };
  if (code >= 61) return { icon: '🌧️', label: 'Lluvia' };
  if (code >= 51) return { icon: '🌦️', label: 'Llovizna' };
  if (code >= 45) return { icon: '🌫️', label: 'Niebla' };
  if (code >= 3) return { icon: '☁️', label: 'Nublado' };
  if (code >= 1) return { icon: '⛅', label: 'Algo nublado' };
  return { icon: '🌙', label: 'Despejado' };
}

/** Resume las horas de la fiesta: desde el inicio hasta el fin (o 5 horas si no hay fin). */
export function summarize(hourly: Hourly, startsAt: string, endsAt?: string | null): PartyWeather | null {
  const from = `${startsAt.slice(0, 13)}:00`;
  const until = endsAt && endsAt > startsAt ? endsAt.slice(0, 16) : plusHours(startsAt, 5);
  const idx = hourly.time.map((t, i) => [t, i] as const).filter(([t]) => t >= from && t <= until).map(([, i]) => i);
  if (!idx.length) return null;
  const temps = idx.map(i => hourly.temperature_2m[i]);
  const rainChance = Math.max(...idx.map(i => hourly.precipitation_probability[i] ?? 0));
  const windMax = Math.round(Math.max(...idx.map(i => hourly.wind_speed_10m[i])));
  const { icon, label } = describe(Math.max(...idx.map(i => hourly.weather_code[i])));
  const tempStart = Math.round(temps[0]), tempEnd = Math.round(temps[temps.length - 1]);
  const tips: string[] = [];
  if (rainChance >= 50) tips.push('Puede llover: cuidá el equipo y llevá algo para cubrirlo.');
  if (windMax >= 35) tips.push('Va a haber viento: ojo con tomas al aire libre.');
  if (Math.min(...temps) <= 12) tips.push('Refresca a la noche: llevá abrigo.');
  if (Math.max(...temps) >= 30) tips.push('Hace calor: llevá agua.');
  return { icon, label, tempStart, tempEnd, rainChance, windMax, tips };
}
