import type { SupabaseClient } from '@supabase/supabase-js';
import { fromRows, type Changes, type Row, type Rows } from './rows';
import type { Db } from './types';

export const emptyDb = (): Db => ({ version: 1, salons: [], cms: [], coverages: [], collections: [], cmPayments: [] });
export const newId = () => crypto.randomUUID();

/** Lee todas las tablas de la cuenta (las políticas filtran por dueña) y arma el Db. */
export async function loadDb(supabase: SupabaseClient): Promise<Db> {
  const read = async (table: string) => {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    return (data ?? []) as Row[];
  };
  const [salons, cms, coverages, assignments, expenses, checklist_items, collections, payments, allocations] = await Promise.all([
    read('salons'), read('cms'), read('coverages'), read('assignments'), read('expenses'),
    read('checklist_items'), read('collections'), read('cm_payments'), read('payment_allocations')
  ]);
  const byPayment = new Map<string, Row[]>();
  for (const a of allocations) byPayment.set(String(a.payment_id), [...(byPayment.get(String(a.payment_id)) ?? []), a]);
  const rows: Rows = {
    salons: sortBy(salons, 'name'), cms: sortBy(cms, 'name'), coverages: sortBy(coverages, 'starts_at'),
    assignments, expenses, checklist_items,
    collections: sortBy(collections, 'date'),
    cm_payments: sortBy(payments, 'date').map(p => ({ ...p, allocations: byPayment.get(p.id) ?? [] }))
  };
  return fromRows(rows);
}

/** Aplica los cambios en una sola transacción: se guarda todo o nada. */
export async function saveChanges(supabase: SupabaseClient, changes: Changes): Promise<void> {
  const { error } = await supabase.rpc('save_changes', { changes });
  if (error) throw error;
}

const sortBy = (rows: Row[], key: string) => [...rows].sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')));
