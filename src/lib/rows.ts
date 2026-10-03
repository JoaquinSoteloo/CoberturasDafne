import type { Db, Expense } from './types';

/**
 * Traducción entre el objeto que usa la app (Db) y las filas de Supabase.
 * La app sigue trabajando con Db entero; al guardar, `diff` calcula solo las
 * filas que cambiaron desde el último guardado confirmado.
 */

export const TABLES = ['salons', 'cms', 'coverages', 'assignments', 'expenses', 'checklist_items', 'schedule_items', 'collections', 'cm_payments'] as const;
export type Table = typeof TABLES[number];
export type Row = { id: string } & Record<string, unknown>;
export type Rows = Record<Table, Row[]>;
/** Por tabla, cada id con su fila serializada: sirve para comparar. */
export type Snapshot = Record<Table, Map<string, string>>;
export type Changes = { upsert: Partial<Record<Table, Row[]>>; delete: Partial<Record<Table, string[]>> };
/** Versión vigente de cada fila según la base. Guardar exige mandarla: si otra persona cambió la fila, se rechaza. */
export type Versions = Record<Table, Map<string, number>>;
export const emptyVersions = (): Versions => Object.fromEntries(TABLES.map(t => [t, new Map()])) as unknown as Versions;

/** Suma a `versions` las que devolvió la base al guardar ({tabla: {id: versión}}). */
export function mergeVersions(versions: Versions, saved: Partial<Record<Table, Record<string, number>>> | null | undefined): Versions {
  const next = Object.fromEntries(TABLES.map(t => [t, new Map(versions[t])])) as unknown as Versions;
  for (const t of TABLES) for (const [id, v] of Object.entries(saved?.[t] ?? {})) next[t].set(id, v);
  return next;
}

type Allocation = { position: number; assignment_id: string | null; expense_id: string | null; amount_cents: number };

const conceptRefs = (conceptId: string) => {
  const [kind, id] = conceptId.split(':');
  return kind === 'fee' ? { assignment_id: id, expense_id: null } : { assignment_id: null, expense_id: id };
};
const conceptId = (a: Pick<Allocation, 'assignment_id' | 'expense_id'>) => a.assignment_id ? `fee:${a.assignment_id}` : `expense:${a.expense_id}`;

export function toRows(db: Db): Rows {
  return {
    salons: db.salons.map(s => ({ id: s.id, name: s.name, address: s.address, lat: s.lat ?? null, lng: s.lng ?? null })),
    cms: db.cms.map(c => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, usual_fee_cents: c.usualFeeCents, notes: c.notes, alias: c.alias ?? '' })),
    coverages: db.coverages.map(c => ({
      id: c.id, name: c.name, party_type: c.partyType, client: c.client, salon_id: c.salonId, address: c.address,
      starts_at: c.startsAt, ends_at: c.endsAt || null, arrive_at: c.arriveAt || null, live_posting: c.livePosting, dafne_goes: c.dafneGoes, notes: c.notes, agreed_cents: c.agreedCents, drive_url: c.driveUrl,
      delivered_pieces: c.deliveredPieces, delivery_notes: c.deliveryNotes, event_status: c.eventStatus, delivery_status: c.deliveryStatus
    })),
    assignments: db.coverages.flatMap(c => c.assignments.map((a, position) => ({
      id: a.id, coverage_id: c.id, cm_id: a.cmId, fee_cents: a.feeCents, confirmation: a.confirmation, position
    }))),
    expenses: db.coverages.flatMap(c => c.expenses.map((e, position) => ({
      id: e.id, coverage_id: c.id, label: e.label, kind: e.kind, amount_cents: e.amountCents,
      payment_status: e.paymentStatus ?? null, advanced_by: e.advancedBy ?? null, advanced_cm_id: e.advancedCmId ?? null,
      absorbed_by: e.absorbedBy, position,
      trip_from: e.tripFrom || null, trip_to: e.tripTo || null, trip_started_at: e.tripStartedAt || null, trip_ended_at: e.tripEndedAt || null
    }))),
    checklist_items: db.coverages.flatMap(c => c.checklist.map((x, position) => ({ id: x.id, coverage_id: c.id, text: x.text, done: x.done, stage: x.stage ?? (x.done ? 'drive' : 'pendiente'), position }))),
    schedule_items: db.coverages.flatMap(c => c.schedule.map((m, position) => ({ id: m.id, coverage_id: c.id, at: m.at, label: m.label, notify: m.notify, position }))),
    collections: db.collections.map(p => ({ id: p.id, coverage_id: p.coverageId, date: p.date, amount_cents: p.amountCents, notes: p.notes })),
    cm_payments: db.cmPayments.map(p => ({
      id: p.id, cm_id: p.cmId, date: p.date, notes: p.notes,
      allocations: p.allocations.map((a, position): Allocation => ({ position, ...conceptRefs(a.conceptId), amount_cents: a.amountCents }))
    }))
  };
}

const byPosition = (a: Row, b: Row) => Number(a.position) - Number(b.position);
const groupBy = (rows: Row[], key: string) => {
  const groups = new Map<string, Row[]>();
  for (const row of [...rows].sort(byPosition)) groups.set(String(row[key]), [...(groups.get(String(row[key])) ?? []), row]);
  return groups;
};
const str = (v: unknown) => (v ?? '') as string;
// Postgres devuelve "2026-10-05T21:00:00"; la app usa "2026-10-05T21:00".
const minutes = (v: unknown) => v ? String(v).replace(' ', 'T').slice(0, 16) : '';

/** Arma el Db a partir de las filas leídas (cm_payments con sus allocations ya agrupadas). */
export function fromRows(rows: Rows): Db {
  const assignments = groupBy(rows.assignments, 'coverage_id');
  const expenses = groupBy(rows.expenses, 'coverage_id');
  const checklist = groupBy(rows.checklist_items, 'coverage_id');
  const schedule = groupBy(rows.schedule_items, 'coverage_id');
  return {
    version: 1,
    salons: rows.salons.map(s => ({ id: s.id, name: str(s.name), address: str(s.address), ...(s.lat != null && s.lng != null ? { lat: Number(s.lat), lng: Number(s.lng) } : {}) })),
    cms: rows.cms.map(c => ({ id: c.id, name: str(c.name), phone: str(c.phone), email: str(c.email), usualFeeCents: Number(c.usual_fee_cents), notes: str(c.notes), ...(c.alias ? { alias: str(c.alias) } : {}), ...(c.photo_path ? { photoPath: str(c.photo_path) } : {}) })),
    coverages: rows.coverages.map(c => ({
      id: c.id, name: str(c.name), partyType: str(c.party_type), client: str(c.client), salonId: str(c.salon_id), address: str(c.address),
      startsAt: minutes(c.starts_at), endsAt: minutes(c.ends_at), arriveAt: minutes(c.arrive_at), livePosting: Boolean(c.live_posting), dafneGoes: Boolean(c.dafne_goes), notes: str(c.notes), agreedCents: Number(c.agreed_cents),
      driveUrl: str(c.drive_url), deliveredPieces: Number(c.delivered_pieces), deliveryNotes: str(c.delivery_notes),
      eventStatus: c.event_status as Db['coverages'][number]['eventStatus'], deliveryStatus: c.delivery_status as Db['coverages'][number]['deliveryStatus'],
      assignments: (assignments.get(c.id) ?? []).map(a => ({ id: a.id, cmId: str(a.cm_id), feeCents: Number(a.fee_cents), confirmation: a.confirmation as 'pendiente' })),
      expenses: (expenses.get(c.id) ?? []).map(e => {
        const expense: Expense = { id: e.id, label: str(e.label), kind: e.kind as Expense['kind'], amountCents: Number(e.amount_cents), absorbedBy: e.absorbed_by as Expense['absorbedBy'] };
        if (e.payment_status) expense.paymentStatus = e.payment_status as Expense['paymentStatus'];
        if (e.advanced_by) expense.advancedBy = e.advanced_by as Expense['advancedBy'];
        if (e.advanced_cm_id) expense.advancedCmId = str(e.advanced_cm_id);
        if (e.receipt_path) expense.receiptPath = str(e.receipt_path);
        if (e.trip_from) expense.tripFrom = str(e.trip_from);
        if (e.trip_to) expense.tripTo = str(e.trip_to);
        if (e.trip_started_at) expense.tripStartedAt = minutes(e.trip_started_at);
        if (e.trip_ended_at) expense.tripEndedAt = minutes(e.trip_ended_at);
        return expense;
      }),
      checklist: (checklist.get(c.id) ?? []).map(x => ({ id: x.id, text: str(x.text), done: Boolean(x.done), ...(x.stage === 'whatsapp' ? { stage: 'whatsapp' as const } : {}) })),
      schedule: (schedule.get(c.id) ?? []).map(m => ({ id: m.id, at: minutes(m.at), label: str(m.label), notify: Boolean(m.notify) }))
    })),
    collections: rows.collections.map(p => ({ id: p.id, coverageId: str(p.coverage_id), date: str(p.date), amountCents: Number(p.amount_cents), notes: str(p.notes), ...(p.receipt_path ? { receiptPath: str(p.receipt_path) } : {}) })),
    cmPayments: rows.cm_payments.map(p => ({
      id: p.id, cmId: str(p.cm_id), date: str(p.date), notes: str(p.notes), ...(p.receipt_path ? { receiptPath: str(p.receipt_path) } : {}),
      allocations: ((p.allocations ?? []) as Allocation[]).slice().sort((a, b) => a.position - b.position)
        .map(a => ({ conceptId: conceptId(a), amountCents: Number(a.amount_cents) }))
    }))
  };
}

export function snapshotOf(db: Db): Snapshot {
  const rows = toRows(db);
  return Object.fromEntries(TABLES.map(t => [t, new Map(rows[t].map(r => [r.id, JSON.stringify(r)]))])) as Snapshot;
}

/** Qué hay que mandar a Supabase para pasar de `before` a `db`. */
export function diff(before: Snapshot, db: Db, versions: Versions = emptyVersions()): { changes: Changes; after: Snapshot; empty: boolean } {
  const rows = toRows(db); const after = snapshotOf(db);
  const changes: Changes = { upsert: {}, delete: {} };
  let empty = true;
  for (const table of TABLES) {
    const upsert = rows[table].filter(r => before[table].get(r.id) !== after[table].get(r.id))
      .map(r => versions[table].has(r.id) ? { ...r, version: versions[table].get(r.id) } : r);
    const removed = [...before[table].keys()].filter(id => !after[table].has(id));
    if (upsert.length) { changes.upsert[table] = upsert; empty = false; }
    if (removed.length) { changes.delete[table] = removed; empty = false; }
  }
  return { changes, after, empty };
}
