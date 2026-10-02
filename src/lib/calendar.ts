export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function calendarDays(month: string) {
  const [year,number]=month.split('-').map(Number);
  const first=new Date(year,number-1,1,12);
  const offset=(first.getDay()+6)%7;
  const count=Math.ceil((offset+new Date(year,number,0).getDate())/7)*7;
  return Array.from({length:count},(_,i)=>dayKey(new Date(year,number-1,1-offset+i,12)));
}
export function shiftMonth(month:string,delta:number){const [y,m]=month.split('-').map(Number);return dayKey(new Date(y,m-1+delta,1,12)).slice(0,7)}
