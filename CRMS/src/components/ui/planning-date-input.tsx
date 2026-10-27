import type {ComponentProps} from 'react';
import {Input} from './input';
import {usePlanningDate} from '../../../../src/utils/usePlanningDate';
export function PlanningDateInput({timeZone,...props}:ComponentProps<typeof Input>&{timeZone?:string}){
  const {clock,input,inputProps}=usePlanningDate(props,timeZone);
  return <><Input {...inputProps} className={`[color-scheme:light] dark:[color-scheme:dark] ${props.className||''}`} ref={input}/>{clock.error&&<span role="alert" className="block text-xs text-destructive">{clock.error}</span>}</>;
}
