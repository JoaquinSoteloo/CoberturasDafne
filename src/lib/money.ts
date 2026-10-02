export const ars = (cents: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(cents / 100);
/**
 * Lee un monto escrito como en Argentina y lo devuelve en centavos. Vacío es 0.
 * Acepta "200000", "200.000", "1500,50" y "1.500,50"; si no es un monto, devuelve null.
 */
export const parseAmount = (text: string): number | null => {
  const t = text.replace(/[\s$]/g, '');
  if (!t) return 0;
  // Con coma, la coma es el decimal y los puntos son de miles. Sin coma, puntos de a tres cifras son de miles.
  const plain = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
  if (!/^\d+(\.\d{1,2})?$/.test(plain)) return null;
  return Math.round(Number(plain) * 100);
};
/** Centavos a texto para un campo: "200.000" o "1.500,50". */
export const formatAmount = (cents: number) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
export const dateLabel = (iso: string) => iso ? new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${iso.slice(0, 10)}T12:00:00`)) : '—';
export const dateTimeLabel = (iso: string) => `${dateLabel(iso)} · ${iso.slice(11, 16)}`;
