'use client';
import { useEffect } from 'react';

/** Registra el service worker solo en producción: en desarrollo guardaría archivos viejos. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sin service worker la app funciona igual */ });
  }, []);
  return null;
}
