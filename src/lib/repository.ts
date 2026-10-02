import { createSeed } from './seed';
import type { Db } from './types';

const KEY = 'dafne-coberturas-demo-v1';
export const loadDb = (): Db => {
  if (typeof window === 'undefined') return createSeed();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) { const seed = createSeed(); saveDb(seed); return seed; }
    const value = JSON.parse(raw) as Db;
    return value.version === 1 && Array.isArray(value.coverages) ? value : createSeed();
  } catch { return createSeed(); }
};
export const saveDb = (db: Db) => localStorage.setItem(KEY, JSON.stringify(db));
export const newId = () => crypto.randomUUID();
