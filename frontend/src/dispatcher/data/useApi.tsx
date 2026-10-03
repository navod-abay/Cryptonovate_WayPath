import { useEffect, useState, type DependencyList } from 'react';

export function useApi<T>(loader: (signal: AbortSignal) => Promise<T>, dependencies: DependencyList, poll = 60000) {
  const [data,setData] = useState<T>();
  const [error,setError] = useState<string>();
  const [loading,setLoading] = useState(true);
  const [version,setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let busy = false;
    setData(undefined); setError(undefined); setLoading(true);
    const load = async () => {
      if (busy) return; busy = true;
      try { const value = await loader(controller.signal); if (!controller.signal.aborted) { setData(value); setError(undefined); } }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Request failed.'); }
      finally { busy = false; if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    const timer = poll ? window.setInterval(load,poll) : undefined;
    return () => { controller.abort(); if (timer) window.clearInterval(timer); };
  }, [...dependencies,version]);
  return { data,error,loading,retry:()=>setVersion(v=>v+1) };
}
export function RequestState({ resource }: { resource: { loading:boolean;error?:string;retry:()=>void } }) {
  if (resource.loading) return <p className="request-state" role="status">Loading…</p>;
  if (resource.error) return <div className="request-state error" role="alert">{resource.error} <button onClick={resource.retry}>Retry</button></div>;
  return null;
}
