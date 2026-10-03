/** Un momento leído de un cronograma pegado: hora "HH:MM" y nombre. */
export type ParsedMoment = { time: string; label: string };

// Horas como 21:30, 21.30, 21hs, 21 hs, 21h30, 9:15hs. Un número solo ("15 años") no es una hora.
const TIME = /(?<![\d:.])([01]?\d|2[0-3])(?:\s*[:.]\s*([0-5]\d)(?:\s*(?:hs|hrs|h)\.?)?|\s*(?:hs|hrs|h|horas?)\.?(?:\s*([0-5]\d))?)(?![\d])/i;
const TIME_ALL = new RegExp(TIME.source, 'gi');

const cleanLabel = (text: string) => {
  const label = text
    .replace(/^[\s\-–—:•·*|>,.()\[\]]+|[\s\-–—:•·*|>,.()\[\]]+$/g, '')
    .replace(/^(?:a\s+las?|desde\s+las?|de|a|hasta|aprox\.?|aproximadamente)\s+/i, '')
    .replace(/\s+(?:aprox\.?|aproximadamente)$/i, '')
    .replace(/^[\s\-–—:•·*|>,.]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return label ? label[0].toUpperCase() + label.slice(1) : '';
};

/**
 * Lee el cronograma que manda el salón, una línea por momento ("21:30 Entrada", "Vals 23hs").
 * Devuelve lo que entendió y las líneas con texto que no pudo leer.
 */
export function parseSchedule(text: string): { items: ParsedMoment[]; skipped: string[] } {
  const items: ParsedMoment[] = [], skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(TIME);
    if (!match) { if (/[a-záéíóúñ]/i.test(line)) skipped.push(line); continue; }
    const time = `${match[1].padStart(2, '0')}:${match[2] ?? match[3] ?? '00'}`;
    const label = cleanLabel(line.replace(TIME_ALL, ' '));
    if (!label) { skipped.push(line); continue; }
    items.push({ time, label });
  }
  return { items, skipped };
}
