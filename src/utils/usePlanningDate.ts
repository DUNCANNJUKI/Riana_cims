import {useEffect,useRef,useState,useSyncExternalStore,type ComponentProps,type FocusEvent,type ChangeEvent} from 'react';
import {serverClockSnapshot,subscribeServerClock,refreshServerClock} from './serverClock';
import {planningMinimum} from './planningDates';
import {apiFetch} from '../integrations/apiClient';

export function usePlanningDate(props:ComponentProps<'input'>,timeZone?:string,subsidiaryId?:string,branchId?:string){
  const clock=useSyncExternalStore(subscribeServerClock,serverClockSnapshot,serverClockSnapshot);
  const [calendar,setCalendar]=useState({zone:'',pending:false,error:''});
  useEffect(()=>{
    if(timeZone||(!subsidiaryId&&!branchId)){setCalendar({zone:'',pending:false,error:''});return;}
    const controller=new AbortController();setCalendar({zone:'',pending:true,error:''});
    const query=new URLSearchParams({...(subsidiaryId?{subsidiary_id:subsidiaryId}:{}),...(branchId?{branch_id:branchId}:{})});
    void apiFetch(`/scheduling/policy?${query}`,{signal:controller.signal},0).then(data=>{
      if(!controller.signal.aborted)setCalendar({zone:data.configuration?.time_zone||'',pending:false,error:''});
    }).catch(error=>{if(!controller.signal.aborted)setCalendar({zone:'',pending:false,error:error.status===503?'':'The scheduling calendar could not be verified.'});});
    return ()=>controller.abort();
  },[timeZone,subsidiaryId,branchId]);
  const initial=useRef(String(props.value || ''));
  const [validationError,setValidationError]=useState('');
  let minimum:string|undefined;let zoneError='';
  try{minimum=clock.ready?planningMinimum(props.type==='datetime-local',new Date(clock.now),timeZone||calendar.zone||clock.timeZone):undefined;}catch{zoneError='Enter a valid IANA scheduling time zone.';}
  const input=useRef<HTMLInputElement|null>(null);
  useEffect(()=>{
    if(!input.current)return;
    const value=String(props.value || '');
    const expired=clock.ready&&minimum&&value&&value<minimum&&value!==initial.current;
    input.current.setCustomValidity(expired?'The selected schedule has expired. Choose a future date or time.':'');
    if(expired)setValidationError('The selected schedule has expired. Choose a future date or time.');
  },[minimum,props.value,clock.ready]);
  const nativeMinimum=minimum&&initial.current&&String(props.value||'')===initial.current&&initial.current<minimum?initial.current:minimum;
  return {clock:zoneError||calendar.error||validationError?{...clock,error:clock.error||zoneError||calendar.error||validationError}:clock,minimum,input,inputProps:{...props,min:nativeMinimum,disabled:props.disabled||!clock.ready||!!zoneError||calendar.pending,
    onFocus:(event:FocusEvent<HTMLInputElement>)=>{void refreshServerClock();props.onFocus?.(event);},
    onChange:(event:ChangeEvent<HTMLInputElement>)=>{
      const value=event.target.value;
      if(minimum && value && value<minimum && value!==initial.current){
        setValidationError('The selected date or time has passed. Choose a future schedule.');event.target.setCustomValidity('The selected date or time has passed. Choose a future schedule.');event.target.reportValidity();event.target.value=String(props.value||'');event.target.setCustomValidity('');return;
      }
      setValidationError('');event.target.setCustomValidity('');props.onChange?.(event);
    }}};
}
