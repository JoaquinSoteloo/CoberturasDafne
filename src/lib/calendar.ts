export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function calendarDays(month: string) {
  const [year,number]=month.split('-').map(Number);
  const first=new Date(year,number-1,1,12);
  const offset=(first.getDay()+6)%7;
  const count=Math.ceil((offset+new Date(year,number,0).getDate())/7)*7;
  return Array.from({length:count},(_,i)=>dayKey(new Date(year,number-1,1-offset+i,12)));
}
export function shiftMonth(month:string,delta:number){const [y,m]=month.split('-').map(Number);return dayKey(new Date(y,m-1+delta,1,12)).slice(0,7)}

/** Hora de fin de la fiesta: si es igual o anterior a la de inicio, termina al día siguiente. */
export function endsAtFor(startsAt: string, time: string): string {
  if (!time || !startsAt) return '';
  const day = startsAt.slice(0, 10);
  if (time > startsAt.slice(11, 16)) return `${day}T${time}`;
  const next = new Date(`${day}T12:00`); next.setDate(next.getDate() + 1);
  return `${dayKey(next)}T${time}`;
}

/** Hora de llegada de las CM: el día que la deja más cerca del inicio (21:00 → 20:30 el mismo día; 00:30 → 23:45 el día anterior). */
export function arriveAtFor(startsAt: string, time: string): string {
  if (!time || !startsAt) return '';
  const start = new Date(startsAt).getTime();
  const options = [-1, 0, 1].map(offset => { const d = new Date(`${startsAt.slice(0, 10)}T12:00`); d.setDate(d.getDate() + offset); return `${dayKey(d)}T${time}`; });
  return options.reduce((best, v) => Math.abs(new Date(v).getTime() - start) < Math.abs(new Date(best).getTime() - start) ? v : best);
}
