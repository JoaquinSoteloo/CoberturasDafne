import type { ChecklistItem } from './types';

/** Convierte una lista pegada desde Notas o un mensaje en ideas individuales. */
export function parseChecklistIdeas(raw: string): string[] {
  const separated = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[;；]+/g, '\n')
    .replace(/\s*[•●▪☐☑✅]\s*/g, '\n')
    .replace(/(?:^|\s)(?=\d{1,2}[.)]\s+)/g, '\n');
  const seen = new Set<string>();
  return separated.split('\n')
    .map(line => line.replace(/^\s*(?:[-*–—]|\d{1,2}[.)])\s*/, '').trim())
    .filter(line => {
      const key = line.toLocaleLowerCase('es-AR');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function newChecklistItems(raw: string, existing: ChecklistItem[], id: () => string): ChecklistItem[] {
  const current = new Set(existing.map(item => item.text.trim().toLocaleLowerCase('es-AR')));
  return parseChecklistIdeas(raw)
    .filter(text => !current.has(text.toLocaleLowerCase('es-AR')))
    .map(text => ({ id: id(), text, done: false }));
}
