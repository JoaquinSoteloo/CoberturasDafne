/** "$ 50.000", o "$ 1.500,50" si hay centavos. */
export const ars = (cents: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
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
/**
 * Formatea un monto mientras se escribe ("1500000" → "1.500.000") y dice dónde queda el cursor.
 * Los puntos de miles los pone solo; un punto tecleado a mano se toma como coma de centavos
 * (hay teclados del celular que solo tienen punto). `prev` es el texto que había antes de tocar.
 */
export const formatTyping = (raw: string, caret: number, prev = ''): { text: string; caret: number } => {
  let s = raw, at = caret;
  if (s.length === prev.length - 1 && prev[at] === '.') { s = s.slice(0, Math.max(0, at - 1)) + s.slice(at); at = Math.max(0, at - 1); } // borró un punto de miles: borra la cifra de antes
  if (!s.includes(',')) {
    if (s.length === prev.length + 1 && s[at - 1] === '.') s = `${s.slice(0, at - 1)},${s.slice(at)}`;
    else if (s.length > prev.length + 1) { const t = s.replace(/[^\d.]/g, ''); if (/^\d+\.\d{1,2}$/.test(t) && !/^\d{1,3}(\.\d{3})+$/.test(t)) s = s.replace('.', ','); } // pegado "1500.50"
  }
  const comma = s.indexOf(',');
  const intRaw = (comma < 0 ? s : s.slice(0, comma)).replace(/\D/g, '');
  const dec = comma < 0 ? '' : s.slice(comma + 1).replace(/\D/g, '').slice(0, 2);
  let int = intRaw.replace(/^0+(?=\d)/, '');
  // Cuántas cifras (y la coma) quedaban antes del cursor, para dejarlo en el mismo lugar.
  let n = [...s.slice(0, at)].filter((ch, i) => /\d/.test(ch) || i === comma).length;
  n -= Math.min(intRaw.length - int.length, [...s.slice(0, Math.min(at, comma < 0 ? at : comma))].filter(ch => /\d/.test(ch)).length);
  if (!int && comma >= 0) { int = '0'; n += 1; }
  const text = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (comma >= 0 ? `,${dec}` : '');
  let pos = 0;
  for (let seen = 0; pos < text.length && seen < n; pos++) if (text[pos] !== '.') seen++;
  return { text, caret: pos };
};
