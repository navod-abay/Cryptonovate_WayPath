import { getAccessToken,refreshAccessToken } from './session';

export class ApiError extends Error {
  constructor(message:string,public status:number) { super(message); }
}
export const base=(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/,'');

/** Calls the API with the signed-in user's access token. Failures surface as ApiError. */
export async function request<T>(path:string,signal?:AbortSignal,init:RequestInit={}):Promise<T> {
  try {
    const send=()=>{
      const token=getAccessToken();
      return fetch(`${base}/api${path}`,{
        ...init,signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000),
        headers:{...(init.body ? {'Content-Type':'application/json'} : {}),...(token ? {Authorization:`Bearer ${token}`} : {}),...init.headers},
      });
    };
    let response=await send();
    // Access tokens last 15 minutes: refresh once, then retry with the new one.
    if(response.status===401 && getAccessToken() && await refreshAccessToken(base))response=await send();
    let result;
    try{result=await response.json();}catch{throw new ApiError(`API request failed (${response.status})`,response.status);}
    if(!response.ok)throw new ApiError(typeof result.error==='string' ? result.error : result.error?.message || `API request failed (${response.status})`,response.status);
    if(result.success===false)throw new ApiError(typeof result.error==='string' ? result.error : result.error?.message || 'API request failed',response.status);
    return (result.success===true && 'data' in result ? result.data : result) as T;
  } catch(error) {
    if(signal?.aborted || error instanceof ApiError)throw error;
    throw new ApiError('Cannot reach the API. Please try again.',0);
  }
}
