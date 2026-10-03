export type Confirmation = 'pendiente' | 'confirmada' | 'rechazada';
export type EventStatus = 'pendiente' | 'realizado' | 'cancelado';
export type DeliveryStatus = 'pendiente' | 'entregada';

export type Cm = { id: string; name: string; phone: string; email: string; notes: string; /** Alias o CBU/CVU para transferirle. */ alias?: string; /** Foto de perfil que sube la CM. */ photoPath?: string };
export type Salon = { id: string; name: string; address: string; /** Ubicación exacta, para pedir Uber. */ lat?: number; lng?: number };
export type Assignment = { id: string; cmId: string; feeCents: number; confirmation: Confirmation };
export type Expense = {
  id: string; label: string; kind: 'uber' | 'otro'; amountCents: number;
  paymentStatus?: 'pendiente' | 'pagado';
  advancedBy?: 'coordinadora' | 'cm'; advancedCmId?: string;
  absorbedBy: 'coordinadora' | 'salon';
  /** Ubicación del comprobante en el almacenamiento. Se guarda aparte, no en save_changes. */
  receiptPath?: string;
  /** Datos del viaje (Ubers). Horarios en hora local: "AAAA-MM-DDTHH:MM". */
  tripFrom?: string; tripTo?: string; tripStartedAt?: string; tripEndedAt?: string;
};
export type ChecklistItem = { id: string; text: string; done: boolean; /** ✓ WhatsApp o ✓✓ Drive. Sin dato: tildado = Drive. */ stage?: 'pendiente' | 'whatsapp' | 'drive' };
/** Un momento de la noche (entrada, vals, torta…). `at` en hora local: "AAAA-MM-DDTHH:MM". Con `notify`, las CM reciben un aviso 10 minutos antes. */
export type Moment = { id: string; at: string; label: string; notify: boolean };
export type Coverage = {
  id: string; name: string; partyType: string; client: string; salonId: string;
  address: string; startsAt: string; endsAt: string;
  /** Hora en que tienen que llegar las CM ('' = a la hora de inicio). */
  arriveAt: string; notes: string;
  /** Sale en vivo: los videos editados se suben a la cuenta de IG durante la fiesta. */
  livePosting: boolean;
  /** "Voy yo": Dafne cubre la fiesta (sola o con CM). Sin honorario: lo que queda es su ganancia. */
  dafneGoes: boolean;
  assignments: Assignment[]; agreedCents: number; expenses: Expense[];
  checklist: ChecklistItem[]; schedule: Moment[]; driveUrl: string; deliveredPieces: number;
  deliveryNotes: string; eventStatus: EventStatus; deliveryStatus: DeliveryStatus;
};
export type Collection = { id: string; coverageId: string; date: string; amountCents: number; notes: string; /** Captura de la transferencia del salón. */ receiptPath?: string };
export type Allocation = { conceptId: string; amountCents: number };
export type CmPayment = { id: string; cmId: string; date: string; allocations: Allocation[]; notes: string; /** Captura de la transferencia. */ receiptPath?: string };
export type Db = { version: 1; salons: Salon[]; cms: Cm[]; coverages: Coverage[]; collections: Collection[]; cmPayments: CmPayment[] };
