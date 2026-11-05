import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useMetadata} from '../hooks/api';
import {defaultFilters,parseFilters,serializeFilters,sanitizeAccountFilters,type FilterState} from '../lib/filters';

type Scope={filters:FilterState;update:(patch:Partial<FilterState>)=>void;clear:()=>void;notice:string;metadata:ReturnType<typeof useMetadata>};
const Context=createContext<Scope|null>(null);
export function FilterProvider({children}:{children:ReactNode}) {
 const [params,setParams]=useSearchParams();
 const encoded=params.toString();
 const filters=useMemo(()=>parseFilters(new URLSearchParams(encoded)),[encoded]);
 const metadata=useMetadata({account_ids:filters.account_ids});
 const account=filters.account_ids.join('|');
 const previousAccount=useRef(account);
 const [notice,setNotice]=useState('');
 function update(patch:Partial<FilterState>) {setParams(serializeFilters({...filters,...patch},params,true));}
 useEffect(()=>{
  if(previousAccount.current===account || !metadata.data || metadata.isPlaceholderData) return;
  if((metadata.data.filters_applied.account_ids??[]).join('|')!==account) return;
  previousAccount.current=account;
  const cleaned=sanitizeAccountFilters(filters,metadata.data);
  if(cleaned.removed.length) {
   setNotice(`Removed unavailable filters: ${cleaned.removed.join(', ')}`);
   setParams(serializeFilters(cleaned.filters,new URLSearchParams(encoded),true),{replace:true});
  } else setNotice('Account scope updated');
 },[account,metadata.data,metadata.isPlaceholderData,filters,encoded,setParams]);
 return <Context.Provider value={{filters,update,clear:()=>update({...defaultFilters(),account_ids:filters.account_ids}),notice,metadata}}>{children}</Context.Provider>;
}
export function useFilters(){const value=useContext(Context);if(!value)throw new Error('Missing filter provider');return value;}
