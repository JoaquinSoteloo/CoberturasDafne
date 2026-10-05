import type { SupabaseClient } from '@supabase/supabase-js';
import { TABLES, fromRows, type Changes, type Row, type Rows, type Table, type Versions } from './rows';
import type { Db } from './types';

export const emptyDb = (): Db => ({ version: 1, salons: [], cms: [], coverages: [], collections: [], cmPayments: [] });
export const newId = () => crypto.randomUUID();

/**
 * Lee todas las tablas de la cuenta (las políticas filtran por dueña) y arma el Db. Desde el
 * servidor con el cliente administrador, `ownerId` hace ese filtro.
 */
export async function loadDb(supabase: SupabaseClient, ownerId?: string): Promise<{ db: Db; versions: Versions }> {
  const read = async (table: string) => {
    const query = supabase.from(table).select('*');
    const { data, error } = await (ownerId ? query.eq('owner_id', ownerId) : query);
    if (error) throw error;
    return (data ?? []) as Row[];
  };
  const [salons, cms, coverages, assignments, expenses, checklist_items, schedule_items, collections, payments, allocations] = await Promise.all([
    read('salons'), read('cms'), read('coverages'), read('assignments'), read('expenses'),
    read('checklist_items'), read('schedule_items'), read('collections'), read('cm_payments'), read('payment_allocations')
  ]);
  const byPayment = new Map<string, Row[]>();
  for (const a of allocations) byPayment.set(String(a.payment_id), [...(byPayment.get(String(a.payment_id)) ?? []), a]);
  const rows: Rows = {
    salons: sortBy(salons, 'name'), cms: sortBy(cms, 'name'), coverages: sortBy(coverages, 'starts_at'),
    assignments, expenses, checklist_items, schedule_items,
    collections: sortBy(collections, 'date'),
    cm_payments: sortBy(payments, 'date').map(p => ({ ...p, allocations: byPayment.get(p.id) ?? [] }))
  };
  const versions = Object.fromEntries(TABLES.map(t => [t, new Map(rows[t].map(r => [r.id, Number(r.version ?? 1)]))])) as unknown as Versions;
  return { db: fromRows(rows), versions };
}

/** Aplica los cambios en una sola transacción: se guarda todo o nada. Devuelve las versiones nuevas. */
export async function saveChanges(supabase: SupabaseClient, changes: Changes): Promise<Partial<Record<Table, Record<string, number>>>> {
  const { data, error } = await supabase.rpc('save_changes', { changes });
  if (error) throw error;
  return (data ?? {}) as Partial<Record<Table, Record<string, number>>>;
}

const sortBy = (rows: Row[], key: string) => [...rows].sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')));
