/** Vuelve a poner `item` donde estaba. Si ya está (se deshizo dos veces), no lo duplica. */
export function reinsert<T extends { id: string }>(list: T[], item: T, index: number): T[] {
  if (list.some(x => x.id === item.id)) return list;
  return [...list.slice(0, index), item, ...list.slice(index)];
}
