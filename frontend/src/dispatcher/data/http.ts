import { fileResponse } from './fileData';
import { getSession, setSession } from './session';

export class ApiError extends Error {
  constructor(message:string,public status:number,public sessionExpired=false) { super(message); }
}
const base=(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/,'');
const fallbackEnabled=import.meta.env.VITE_FILE_FALLBACK === 'true';
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

let onUnauthorized:()=>void=()=>undefined;
/** signIn registers what to do when the session can no longer be refreshed. */
export const setUnauthorizedHandler=(handler:()=>void)=>{onUnauthorized=handler;};
const isAuthPath=(path:string)=>path==='/auth/login' || path==='/auth/refresh';
let refreshing:Promise<boolean>|null=null;
function refreshAccessToken():Promise<boolean> {
  const session=getSession();
  if(!session)return Promise.resolve(false);
  refreshing??=fetch(`${base}/api/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refreshToken}),signal:AbortSignal.timeout(3000)})
    .then(async response=>{
      const token=response.ok ? (await response.json().catch(()=>null))?.access_token : null;
      if(typeof token!=='string')return false;
      setSession({...session,accessToken:token});return true;
    }).catch(()=>false).finally(()=>{refreshing=null;});
  return refreshing;
}
function send(path:string,init:RequestInit,signal?:AbortSignal) {
  const token=isAuthPath(path) ? undefined : getSession()?.accessToken;
  return fetch(`${base}/api${path}`,{
    ...init,signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000),
    headers:{...(init.body ? {'Content-Type':'application/json'} : {}),...(token ? {Authorization:`Bearer ${token}`} : {}),...init.headers},
  });
}

/** API first, then a JSON file served by this React app. No sign-in or backend creation. */
export async function request<T>(path:string,signal?:AbortSignal,options:RequestOptions={}):Promise<T> {
  const {fileFallback=true,...init}=options;
  try {
    let response=await send(path,init,signal);
    if(response.status===401 && !isAuthPath(path) && getSession()){
      if(await refreshAccessToken())response=await send(path,init,signal);
      if(response.status===401){onUnauthorized();throw new ApiError('Your session has expired. Please sign in again.',401,true);}
    }
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
    if(apiError.sessionExpired || !fallbackEnabled || !fileFallback || (mutation && [200,400,401,403,409,422].includes(apiError.status)))throw apiError;
    const result=await fileResponse(path,init,signal);
    markSource(path,true);
    return result as T;
  }
}
