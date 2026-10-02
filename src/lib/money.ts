export const ars = (cents: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(cents / 100);
export const toCents = (value: string | number) => {
  const normalized = String(value).trim().replace(/\./g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : NaN;
};
export const moneyInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
export const dateLabel = (iso: string) => iso ? new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${iso.slice(0, 10)}T12:00:00`)) : '—';
export const dateTimeLabel = (iso: string) => `${dateLabel(iso)} · ${iso.slice(11, 16)}`;
