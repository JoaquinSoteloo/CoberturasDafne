'use client';
import { useEffect, useState } from 'react';
import { FALLBACK, forecastUrl, showWeather, summarize, type Hourly, type PartyWeather } from '@/lib/weather';

// Un pedido por salón y día mientras la app está abierta.
const cache = new Map<string, Promise<Hourly | null>>();
const load = (url: string) => {
  if (!cache.has(url)) cache.set(url, fetch(url).then(r => r.ok ? r.json() : null).then(d => (d?.hourly ?? null) as Hourly | null).catch(() => { cache.delete(url); return null; }));
  return cache.get(url)!;
};

/** El clima de las horas de la fiesta. Solo aparece desde unos días antes; si no hay datos, no muestra nada. */
export function WeatherStrip({ startsAt, endsAt, coords }: { startsAt: string; endsAt?: string | null; coords?: { lat: number; lng: number } | null }) {
  const [weather, setWeather] = useState<PartyWeather | null>(null);
  const visible = !!startsAt && showWeather(startsAt);
  const { lat, lng } = coords ?? FALLBACK;
  useEffect(() => {
    if (!visible) return;
    let live = true;
    void load(forecastUrl(lat, lng, startsAt)).then(h => { if (live) setWeather(h ? summarize(h, startsAt, endsAt) : null); });
    return () => { live = false; };
  }, [visible, lat, lng, startsAt, endsAt]);
  if (!visible || !weather) return null;
  return <div className="weather-strip" aria-label="Pronóstico para la fiesta">
    <span className="weather-icon" aria-hidden="true">{weather.icon}</span>
    <div className="min-w-0 flex-1">
      <p className="font-bold">{weather.label} · {weather.tempStart}°{weather.tempEnd !== weather.tempStart && <> → {weather.tempEnd}°</>}</p>
      <p className="muted text-sm">Lluvia {weather.rainChance}% · viento hasta {weather.windMax} km/h{coords ? '' : ' · pronóstico de Buenos Aires'}</p>
      {weather.tips.map(t => <p key={t} className="weather-tip text-sm">{t}</p>)}
    </div>
  </div>;
}
