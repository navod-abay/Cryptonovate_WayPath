import { base } from './http';
import { getAccessToken,refreshAccessToken } from './session';
import { mapIncident,type ApiIncident } from './dispatcherRepository';
import type { Incident } from './types';

/**
 * Live alerts from GET /api/notifications/stream (Server-Sent Events).
 *
 * fetch() instead of EventSource because the stream needs the bearer token in a header. The
 * stream ends when the access token expires (and on server restarts or network drops); we reconnect
 * with Last-Event-ID so the server replays anything missed. Without a token there is
 * no stream and the dashboard keeps polling instead.
 */
export interface AlertStreamHandlers {
  onAlerts:(alerts:Incident[])=>void;
  /** Connected; load the list now so nothing published before the stream opened is missed. */
  onReady:()=>void;
}

const MAX_RETRY_MS=30000;

export function subscribeAlerts(handlers:AlertStreamHandlers):()=>void {
  let stopped=false,lastEventId:string|undefined,retry=1000;
  let controller:AbortController|undefined;
  const run=async()=>{
    while(!stopped) {
      const token=getAccessToken();
      if(!token)return;
      controller=new AbortController();
      try {
        const response=await fetch(`${base}/api/notifications/stream`,{signal:controller.signal,headers:{
          Accept:'text/event-stream',Authorization:`Bearer ${token}`,...(lastEventId ? {'Last-Event-ID':lastEventId} : {}),
        }});
        if(response.status===401) {
          if(await refreshAccessToken(base))continue;
          return;
        }
        if(!response.ok || !response.body)throw new Error(`Alert stream failed (${response.status})`);
        retry=1000;
        await readEvents(response.body,(event,id,data)=>{
          if(id)lastEventId=id;
          if(event==='ready')handlers.onReady();
          else if(event==='alerts')handlers.onAlerts((JSON.parse(data) as ApiIncident[]).map(mapIncident));
        });
      } catch {
        // Dropped connection or bad frame: fall through to the reconnect delay.
      }
      if(stopped)return;
      await new Promise(resolve=>setTimeout(resolve,retry));
      retry=Math.min(retry*2,MAX_RETRY_MS);
    }
  };
  void run();
  return ()=>{stopped=true;controller?.abort();};
}

/** Minimal text/event-stream parser: id, event and data fields; comment lines are heartbeats. */
async function readEvents(body:ReadableStream<Uint8Array>,onEvent:(event:string,id:string|undefined,data:string)=>void) {
  const reader=body.getReader();const decoder=new TextDecoder();
  let buffer='';
  for(;;) {
    const {done,value}=await reader.read();
    if(done)return;
    buffer+=decoder.decode(value,{stream:true}).replace(/\r\n?/g,'\n');
    let end;
    while((end=buffer.indexOf('\n\n'))>=0) {
      const block=buffer.slice(0,end);buffer=buffer.slice(end+2);
      let event='message',id:string|undefined;const data:string[]=[];
      for(const line of block.split('\n')) {
        if(!line || line.startsWith(':'))continue;
        const colon=line.indexOf(':');const field=colon<0 ? line : line.slice(0,colon);
        const value=colon<0 ? '' : line.slice(colon+1).replace(/^ /,'');
        if(field==='event')event=value;else if(field==='id')id=value;else if(field==='data')data.push(value);
      }
      if(data.length || event!=='message')onEvent(event,id,data.join('\n'));
    }
  }
}

/** Newest first; when both lists hold an alert, the first list's copy wins. */
export function mergeIncidents(primary:Incident[],secondary:Incident[]):Incident[] {
  const seen=new Set<string>();
  return [...primary,...secondary].filter(i=>!seen.has(i.id) && !!seen.add(i.id)).sort((a,b)=>a.minutesAgo-b.minutesAgo);
}
