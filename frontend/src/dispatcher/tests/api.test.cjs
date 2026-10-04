const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {buildSync}=require('esbuild');
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

function load(entry,fetch) {
  const code=buildSync({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',define:{
    'import.meta.env.VITE_API_BASE_URL':'""',
  }}).outputFiles[0].text;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require,fetch,AbortSignal,Response,URL,Date,Set,Map,console,TextDecoder,ReadableStream,AbortController,setTimeout,clearTimeout});
  return module.exports;
}
function localToday() {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const value=type=>parts.find(p=>p.type===type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

test('a schedule counts as prepared only once Planning reports a completed run',async()=>{
  let runId;
  const repo=load('data/dispatcherRepository.ts',async(path)=>{
    if(path.startsWith('/api/planning/depots/'))return json({date:'2026-10-05',depot:'Peliyagoda',...(runId ? {planRunId:runId} : {}),vehicles:[]});
    if(path.startsWith('/api/planning/schedule/summary'))return json({depots:[]});
    if(path.startsWith('/api/planning/schedule/deferrals'))return json({orders:[]});
    return json({utilization:null});
  }).dispatcherRepository;
  assert.equal((await repo.getSchedule('2026-10-05','Peliyagoda')).prepared,false);
  runId='run-1';
  assert.equal((await repo.getSchedule('2026-10-05','Peliyagoda')).prepared,true);
});

test('login opens the route gate only after a successful response and resets on sign-out or reload',async()=>{
  const login=load('data/signIn.ts',async(path,init)=>{
    assert.equal(path,'/api/auth/login');
    assert.equal(JSON.parse(init.body).username,'service-user');
    return json({success:true,data:{user:{username:'service-user'}}});
  });
  let changes=0;const unsubscribe=login.subscribeSignIn(()=>changes++);
  assert.equal(login.getSignedIn(),false);
  await login.signIn('service-user','service-password');assert.equal(login.getSignedIn(),true);assert.equal(changes,1);
  assert.equal(load('data/signIn.ts',async()=>{}).getSignedIn(),false);
  login.signOut();assert.equal(login.getSignedIn(),false);assert.equal(changes,2);
  unsubscribe();
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>login.signIn('service-user','service-password',controller.signal));
  assert.equal(login.getSignedIn(),false);
  const rejected=load('data/signIn.ts',async()=>new Response('{}',{status:401}));
  await assert.rejects(()=>rejected.signIn('service-user','wrong'));
  assert.equal(rejected.getSignedIn(),false);
});

test('API requests without a token send no auth header and successful empty responses stay empty',async()=>{
  const paths=[];
  const api=load('data/http.ts',async(path,init)=>{paths.push(path);assert.equal(init.headers.Authorization,undefined);return json({success:true,data:[]});});
  assert.equal((await api.request('/fleet/vehicles')).length,0);
  assert.equal(paths.length,1);
});
test('API failures surface as errors, never as sample data',async()=>{
  const down=load('data/http.ts',async()=>new Response('{}',{status:503}));
  await assert.rejects(()=>down.request('/fleet/vehicles'),/503/);
  const unauthorized=load('data/http.ts',async()=>json({success:false,error:{message:'Bearer authorization token required'}},401));
  await assert.rejects(()=>unauthorized.request('/orders/'),err=>err.status===401 && /Bearer/.test(err.message));
  const offline=load('data/http.ts',async()=>{throw new TypeError('fetch failed');});
  await assert.rejects(()=>offline.request('/fleet/vehicles'),err=>err.status===0 && /Cannot reach the API/.test(err.message));
  const controller=new AbortController();controller.abort();
  const cancelled=load('data/http.ts',async(path,init)=>{init.signal.throwIfAborted();});
  await assert.rejects(()=>cancelled.request('/fleet/vehicles',controller.signal),err=>err.name==='AbortError');
});

test('availability periods merge and include both dates without blocking future dates early',()=>{
  const {normalizePeriods,availabilityOn}=load('data/availability.ts',async()=>{});
  const periods=normalizePeriods([{from:'2026-10-07',to:'2026-10-09'},{from:'2026-10-04',to:'2026-10-06'}]);
  assert.equal(periods.length,1);assert.equal(periods[0].to,'2026-10-09');
  assert.equal(availabilityOn('available',periods,'2026-10-03').available,true);
  assert.equal(availabilityOn('available',periods,'2026-10-04').available,false);
  assert.equal(availabilityOn('available',periods,'2026-10-09').unavailableUntil,'2026-10-09');
  assert.equal(availabilityOn('available',periods,'2026-10-10').available,true);
  assert.throws(()=>normalizePeriods([{from:'2026-02-30',to:'2026-03-01'}]),/valid dates/);
  assert.throws(()=>normalizePeriods([{from:'2026-10-06',to:'2026-10-05'}]),/end date/);
});
test('rejected availability writes and login failures are surfaced',async()=>{
  const api=load('data/dispatcherRepository.ts',async()=>json({success:false,error:{message:'Invalid request'}})).dispatcherRepository;
  // The declared failure is surfaced even when the server incorrectly uses HTTP 200.
  await assert.rejects(()=>api.login('dispatcher','test-password'),/Invalid request/);
  await assert.rejects(()=>api.updateAvailability('VEH001',{status:'available',unavailable_periods:[]}),/Invalid request/);
  const rejected=load('data/dispatcherRepository.ts',async()=>new Response(JSON.stringify({error:{message:'Not allowed'}}),{status:403})).dispatcherRepository;
  await assert.rejects(()=>rejected.updateAvailability('VEH001',{status:'available',unavailable_periods:[]}),/Not allowed/);
  await assert.rejects(()=>rejected.login('dispatcher','test-password'),/Not allowed/);
  const offline=load('data/dispatcherRepository.ts',async()=>new Response('{}',{status:503})).dispatcherRepository;
  await assert.rejects(()=>offline.login('dispatcher','test-password'),/503/);
});
test('login submits only username and password to the existing auth URL',async()=>{
  const repo=load('data/dispatcherRepository.ts',async(path,init)=>{
    assert.equal(path,'/api/auth/login');assert.equal(init.method,'POST');
    assert.deepEqual(JSON.parse(init.body),{username:'dispatcher',password:'test-password'});
    assert.equal(init.headers.Authorization,undefined);
    return json({user:{username:'dispatcher',role:'dispatcher'}});
  }).dispatcherRepository;
  assert.equal((await repo.login('dispatcher','test-password')).user.username,'dispatcher');
});

test('vehicle availability comes from the server calendar',async()=>{
  const date=localToday();
  const repo=load('data/dispatcherRepository.ts',async()=>json({success:true,data:[
    {vehicle_id:'VEH001',depot:'Peliyagoda',type:'van',temp:'ambient',status:'available',unavailable_periods:[{from:date,to:date}]},
    {vehicle_id:'VEH002',depot:'Peliyagoda',type:'van',temp:'ambient',status:'available'},
  ]})).dispatcherRepository;
  const [blocked,free]=await repo.getVehicles();
  assert.equal(blocked.available,false);assert.equal(blocked.unavailableUntil,date);
  assert.equal(free.available,true);
});

test('Sundays are closed days with no schedule',()=>{
  const {isClosedDay}=load('data/scheduleAvailability.ts',async()=>{});
  assert.equal(isClosedDay('2026-10-04'),true);   // Sunday
  assert.equal(isClosedDay('2026-10-03'),false);  // Saturday
  assert.equal(isClosedDay('2026-10-05'),false);  // Monday
  assert.equal(isClosedDay('2027-01-03'),true);   // Sunday across a year boundary
});

test('API login sends the bearer token, refreshes it once on 401 and alerts come from the notification service',async()=>{
  const calls=[];let expired=true;
  const api=load('tests/alertsEntry.ts',async(path,init={})=>{
    calls.push([path,init.headers?.Authorization]);
    if(path==='/api/auth/login')return json({success:true,access_token:'old',refresh_token:'r1'});
    if(path==='/api/auth/refresh'){assert.deepEqual(JSON.parse(init.body),{refresh_token:'r1'});return json({success:true,access_token:'new'});}
    if(expired && init.headers?.Authorization==='Bearer old'){expired=false;return json({success:false,error:'expired'},401);}
    return json({success:true,data:[{id:'a1',type:'driver.incident',kind:'driver',source:'VEH012',summary:'Road access blocked',detail:'d',
      createdAt:new Date(Date.now()-120*60000).toISOString(),receivedAt:new Date().toISOString(),syncedLate:true}]});
  });
  await api.signIn('dispatcher_admin','pw');
  const [alert]=await api.dispatcherRepository.getIncidents();
  assert.deepEqual(calls.slice(1).map(c=>c[0]),['/api/notifications/alerts?limit=50','/api/auth/refresh','/api/notifications/alerts?limit=50']);
  assert.deepEqual(calls.slice(1).map(c=>c[1]),['Bearer old',undefined,'Bearer new']);
  assert.equal(alert.minutesAgo,120);assert.equal(alert.receivedMinutesAgo,0);assert.equal(alert.syncedLate,true);
  api.signOut();
  await api.request('/fleet/vehicles').catch(()=>undefined);
  assert.equal(calls.at(-1)[1],undefined);
});

test('the alert stream parses SSE frames, batches into incidents and replays from Last-Event-ID after a drop',async()=>{
  const encoder=new TextEncoder();
  const body=chunks=>new ReadableStream({start(c){for(const chunk of chunks)c.enqueue(encoder.encode(chunk));c.close();}});
  const streams=[
    ['retry: 5000\n\n','id: 7\nevent: ready\ndata: {}\n\n',': ping\n\n','id: 9\nevent: al','erts\r\ndata: [{"id":"a1","kind":"store","source":"OUT001","summary":"2 missing","detail":"d","createdAt":"'+new Date().toISOString()+'"}]\n\n'],
    ['id: 9\nevent: ready\ndata: {}\n\n'],
  ];
  const seen=[];let unsubscribe;
  const done=new Promise(resolve=>{
    const api=load('tests/alertsEntry.ts',async(path,init={})=>{
      if(path==='/api/auth/login')return json({access_token:'t'});
      seen.push(init.headers['Last-Event-ID']);
      const chunks=streams.shift();
      if(!chunks){resolve();return new Promise(()=>{});}
      return new Response(body(chunks),{headers:{'Content-Type':'text/event-stream'}});
    });
    const events=[];
    api.signIn('dispatcher_admin','pw').then(()=>{unsubscribe=api.subscribeAlerts({
      onReady:()=>events.push('ready'),
      onAlerts:alerts=>events.push(alerts.map(a=>`${a.source}:${a.minutesAgo}`).join()),
    });});
    seen.events=events;
  });
  await done;unsubscribe();
  assert.deepEqual(seen.events,['ready','OUT001:0','ready']);
  // First connect has no cursor; every reconnect resumes from the last frame id.
  assert.deepEqual([...seen],[undefined,'9','9']);
});

test('no live stream before sign-in',async()=>{
  let fetches=0;
  const api=load('tests/alertsEntry.ts',async()=>{fetches++;return json({});});
  const unsubscribe=api.subscribeAlerts({onReady(){},onAlerts(){}});
  await new Promise(resolve=>setTimeout(resolve,20));unsubscribe();
  assert.equal(fetches,0);
});
