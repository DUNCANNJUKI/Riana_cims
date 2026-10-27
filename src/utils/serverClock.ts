type ClockState = {ready:boolean; now:number; timeZone:string; error:string};
let state:ClockState={ready:false,now:0,timeZone:'Africa/Nairobi',error:''};
let anchor=0,monotonic=0,lastSync=0;
let pending:Promise<void>|null=null;
let timer:ReturnType<typeof setInterval>|undefined;
const listeners=new Set<()=>void>();
const publish=()=>{state={...state};listeners.forEach(listener=>listener());};
export const serverClockSnapshot=()=>state;
export function refreshServerClock():Promise<void>{
  if(pending)return pending;
  pending=(async()=>{
    lastSync=performance.now();
    try{
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
      let response:Response;
      try{response=await fetch('/api/time',{cache:'no-store',credentials:'include',signal:controller.signal});}finally{clearTimeout(timeout);}
      if(!response.ok)throw new Error('Clock unavailable');
      const data=await response.json();const time=Date.parse(data.now);
      if(!Number.isFinite(time)||typeof data.time_zone!=='string')throw new Error('Invalid server clock');
      new Intl.DateTimeFormat('en',{timeZone:data.time_zone}).format();
      anchor=time;monotonic=performance.now();lastSync=monotonic;
      state={ready:true,now:time,timeZone:data.time_zone,error:''};
    }catch{state={...state,ready:false,error:'Scheduling time could not be verified. Reconnect and try again.'};}
    finally{pending=null;publish();}
  })();return pending;
}
const tick=()=>{
  if(state.ready){state={...state,now:anchor+performance.now()-monotonic};publish();}
  if(performance.now()-lastSync>=60000)void refreshServerClock();
};
const resume=()=>{if(document.visibilityState==='visible')void refreshServerClock();};
export function subscribeServerClock(listener:()=>void){
  listeners.add(listener);
  if(listeners.size===1){void refreshServerClock();timer=setInterval(tick,1000);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);}
  return ()=>{listeners.delete(listener);if(!listeners.size){clearInterval(timer);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);}};
}
