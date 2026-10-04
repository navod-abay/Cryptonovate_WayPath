import { fileResponse } from './fileData';

export class ApiError extends Error {
  constructor(message:string,public status:number) { super(message); }
}
const base=(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/,'');
const fallbackEnabled=import.meta.env.VITE_FILE_FALLBACK !== 'false';
const fallbackPaths=new Set<string>();
const listeners=new Set<()=>void>();
let snapshot=0;
export const subscribeDataSource=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};};
export const getFallbackCount=()=>snapshot;
export interface RequestOptions extends RequestInit { fileFallback?:boolean }
function markSource(path:string,file:boolean) {
  if(file)fallbackPaths.add(path);else fallbackPaths.delete(path);
  if(snapshot!==fallbackPaths.size){snapshot=fallbackPaths.size;listeners.forEach(listener=>listener());}
}

/** API first, then a JSON file served by this React app. No sign-in or backend creation. */
export async function request<T>(path:string,signal?:AbortSignal,options:RequestOptions={}):Promise<T> {
  const {fileFallback=true,...init}=options;
  try {
    const response=await fetch(`${base}/api${path}`,{
      ...init,signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000),
      headers:{...(init.body ? {'Content-Type':'application/json'} : {}),...init.headers},
    });
    let result;
    try{result=await response.json();}catch{throw new ApiError(`API request failed (${response.status})`,response.status);}
    if(!response.ok)throw new ApiError(typeof result.error==='string' ? result.error : result.error?.message || `API request failed (${response.status})`,response.status);
    if(result.success===false)throw new ApiError(typeof result.error==='string' ? result.error : result.error?.message || 'API request failed',response.status);
    markSource(path,false);
    return (result.success===true && 'data' in result ? result.data : result) as T;
  } catch(error) {
    // Navigation cancellation should never start a fallback fetch or publish stale data.
    if(signal?.aborted)throw error;
    const apiError=error instanceof ApiError ? error : new ApiError('Cannot reach the API. Please try again.',0);
    const mutation=init.method && !['GET','HEAD'].includes(init.method.toUpperCase());
    // Explicit server rejections must not become successful local writes.
    if(!fallbackEnabled || !fileFallback || (mutation && [200,400,401,403,409,422].includes(apiError.status)))throw apiError;
    const result=await fileResponse(path,init,signal);
    markSource(path,true);
    return result as T;
  }
}
