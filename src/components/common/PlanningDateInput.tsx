import {Input} from '@/components/ui/input';
import type {ComponentProps} from 'react';
import {usePlanningDate} from '@/utils/usePlanningDate';
export function PlanningDateInput({timeZone,subsidiaryId,branchId,...props}:ComponentProps<typeof Input>&{timeZone?:string;subsidiaryId?:string;branchId?:string}){
  const {clock,input,inputProps}=usePlanningDate(props,timeZone,subsidiaryId,branchId);
  return <><Input {...inputProps} className={`[color-scheme:light] dark:[color-scheme:dark] ${props.className||''}`} ref={input}/>{clock.error&&<span role="alert" className="block text-xs text-destructive">{clock.error}</span>}</>;
}
