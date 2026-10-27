export const planningMinimum=(datetime=false,now=new Date(),timeZone='Africa/Nairobi')=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(datetime?new Date(now.getTime()+60000):now).map((part)=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}${datetime?`T${parts.hour}:${parts.minute}`:''}`;
};
