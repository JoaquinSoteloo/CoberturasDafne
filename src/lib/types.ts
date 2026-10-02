export type Confirmation = 'pendiente' | 'confirmada' | 'rechazada';
export type EventStatus = 'pendiente' | 'realizado' | 'cancelado';
export type DeliveryStatus = 'pendiente' | 'entregada';

export type Cm = { id: string; name: string; phone: string; email: string; usualFeeCents: number; notes: string };
export type Salon = { id: string; name: string; address: string };
export type Assignment = { id: string; cmId: string; feeCents: number; confirmation: Confirmation };
export type Expense = {
  id: string; label: string; kind: 'uber' | 'otro'; amountCents: number;
  paymentStatus?: 'pendiente' | 'pagado';
  advancedBy?: 'coordinadora' | 'cm'; advancedCmId?: string;
  absorbedBy: 'coordinadora' | 'salon';
  /** Ubicación del comprobante en el almacenamiento. Se guarda aparte, no en save_changes. */
  receiptPath?: string;
};
export type ChecklistItem = { id: string; text: string; done: boolean };
export type Coverage = {
  id: string; name: string; partyType: string; client: string; salonId: string;
  address: string; startsAt: string; endsAt: string; notes: string;
  assignments: Assignment[]; agreedCents: number; expenses: Expense[];
  checklist: ChecklistItem[]; driveUrl: string; deliveredPieces: number;
  deliveryNotes: string; eventStatus: EventStatus; deliveryStatus: DeliveryStatus;
};
export type Collection = { id: string; coverageId: string; date: string; amountCents: number; notes: string };
export type Allocation = { conceptId: string; amountCents: number };
export type CmPayment = { id: string; cmId: string; date: string; allocations: Allocation[]; notes: string };
export type Db = { version: 1; salons: Salon[]; cms: Cm[]; coverages: Coverage[]; collections: Collection[]; cmPayments: CmPayment[] };
