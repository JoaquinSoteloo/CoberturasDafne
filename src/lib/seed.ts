import type { Db } from './types';

const day = (offset: number, time: string) => {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${time}`;
};
const date = (offset: number) => day(offset, '12:00').slice(0, 10);

export const createSeed = (): Db => ({
  version: 1,
  salons: [{ id: 'salon-eclipse', name: 'Eclipse', address: 'Av. Libertador 1240, CABA' }],
  cms: [
    { id: 'cm-luli', name: 'Lucía Fernández', phone: '11 5555-0101', email: '', notes: 'Prefiere eventos de tarde.' },
    { id: 'cm-mica', name: 'Micaela Torres', phone: '11 5555-0102', email: '', notes: '' },
    { id: 'cm-juli', name: 'Julieta Romero', phone: '11 5555-0103', email: '', notes: '' },
    { id: 'cm-rochi', name: 'Rocío Álvarez', phone: '11 5555-0104', email: '', notes: '' }
  ],
  coverages: [
    { id: 'cov-1', name: 'Cumple de Martina', partyType: '15 años', client: 'Familia Gómez', salonId: 'salon-eclipse', address: 'Av. Libertador 1240, CABA', startsAt: day(3, '21:00'), endsAt: day(4, '04:00'), arriveAt: '', livePosting: false, dafneGoes: false, notes: 'Llegar 20 minutos antes.', assignments: [{ id: 'as-1', cmId: 'cm-luli', feeCents: 8500000, confirmation: 'confirmada' }], agreedCents: 16000000, expenses: [{ id: 'ex-1', label: 'Uber de ida', kind: 'uber', amountCents: 1350000, advancedBy: 'cm', advancedCmId: 'cm-luli', absorbedBy: 'salon' }], checklist: [{ id: 'ch-1', text: 'Historias de entrada', done: false }, { id: 'ch-2', text: 'Video del vals', done: false }], schedule: [{ id: 'mo-1', at: day(3, '21:30'), label: 'Entrada', notify: true }, { id: 'mo-2', at: day(4, '00:30'), label: 'Vals', notify: true }], driveUrl: '', deliveredPieces: 0, deliveryNotes: '', eventStatus: 'pendiente', deliveryStatus: 'pendiente' },
    { id: 'cov-2', name: 'Boda de Sofi y Tomás', partyType: 'Boda', client: 'Sofía y Tomás', salonId: 'salon-eclipse', address: 'Av. Libertador 1240, CABA', startsAt: day(8, '20:30'), endsAt: day(9, '03:30'), arriveAt: '', livePosting: false, dafneGoes: false, notes: '', assignments: [{ id: 'as-2', cmId: 'cm-mica', feeCents: 9200000, confirmation: 'pendiente' }, { id: 'as-3', cmId: 'cm-juli', feeCents: 8800000, confirmation: 'confirmada' }], agreedCents: 29500000, expenses: [{ id: 'ex-2', label: 'Uber de vuelta', kind: 'uber', amountCents: 1800000, advancedBy: 'coordinadora', absorbedBy: 'coordinadora' }], checklist: [{ id: 'ch-3', text: 'Preparativos', done: false }, { id: 'ch-4', text: 'Ceremonia', done: false }], schedule: [], driveUrl: '', deliveredPieces: 0, deliveryNotes: '', eventStatus: 'pendiente', deliveryStatus: 'pendiente' },
    { id: 'cov-3', name: 'Fiesta de egresados', partyType: 'Egresados', client: 'Comisión 5° B', salonId: 'salon-eclipse', address: 'Av. Libertador 1240, CABA', startsAt: day(12, '22:00'), endsAt: day(13, '05:00'), arriveAt: '', livePosting: false, dafneGoes: false, notes: 'Confirmar equipo.', assignments: [], agreedCents: 17000000, expenses: [], checklist: [], schedule: [], driveUrl: '', deliveredPieces: 0, deliveryNotes: '', eventStatus: 'pendiente', deliveryStatus: 'pendiente' },
    { id: 'cov-4', name: 'Cumple de Nico', partyType: 'Cumpleaños', client: 'Nicolás Pérez', salonId: 'salon-eclipse', address: 'Av. Libertador 1240, CABA', startsAt: day(-9, '21:00'), endsAt: day(-8, '03:00'), arriveAt: '', livePosting: false, dafneGoes: false, notes: '', assignments: [{ id: 'as-4', cmId: 'cm-rochi', feeCents: 9500000, confirmation: 'confirmada' }], agreedCents: 18000000, expenses: [], checklist: [{ id: 'ch-5', text: 'Reel resumen', done: true }], schedule: [], driveUrl: 'https://drive.google.com/', deliveredPieces: 12, deliveryNotes: 'Material revisado.', eventStatus: 'realizado', deliveryStatus: 'entregada' },
    { id: 'cov-5', name: 'Aniversario de empresa', partyType: 'Corporativo', client: 'Empresa Horizonte', salonId: 'salon-eclipse', address: 'Av. Libertador 1240, CABA', startsAt: day(-19, '19:00'), endsAt: day(-18, '01:00'), arriveAt: '', livePosting: false, dafneGoes: false, notes: '', assignments: [{ id: 'as-5', cmId: 'cm-luli', feeCents: 8500000, confirmation: 'confirmada' }], agreedCents: 16000000, expenses: [], checklist: [], schedule: [], driveUrl: '', deliveredPieces: 0, deliveryNotes: '', eventStatus: 'realizado', deliveryStatus: 'pendiente' }
  ],
  collections: [{ id: 'col-1', coverageId: 'cov-4', date: date(-5), amountCents: 9000000, notes: 'Seña del salón' }],
  cmPayments: [{ id: 'pay-1', cmId: 'cm-rochi', date: date(-4), allocations: [{ conceptId: 'fee:as-4', amountCents: 4000000 }], notes: 'Adelanto' }]
});
