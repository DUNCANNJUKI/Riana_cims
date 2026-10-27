import {isMatch} from 'date-fns';

export function calendarRangeIntersects(start:string,end:string|null|undefined,from:string,to:string){
  const first=String(start||'').slice(0,10),last=String(end||start||'').slice(0,10);
  if(![first,last,from,to].every(day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&isMatch(day,'yyyy-MM-dd')))return false;
  return first<=last&&from<=to&&first<=to&&last>=from;
}
