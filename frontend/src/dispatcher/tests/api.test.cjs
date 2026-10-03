const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {buildSync}=require('esbuild');
const fixture=fs.readFileSync('public/data/dispatcher.json','utf8');
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});

function load(entry,fetch,fallback=true,storage=new Map(),loginMode='demo') {
  const code=buildSync({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',define:{
    'import.meta.env.VITE_API_BASE_URL':'""','import.meta.env.BASE_URL':'"/"','import.meta.env.VITE_FILE_FALLBACK':JSON.stringify(String(fallback)), 'import.meta.env.VITE_LOGIN_MODE':JSON.stringify(loginMode),
  }}).outputFiles[0].text;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require,fetch,AbortSignal,Response,URL,Date,Set,Map,console,localStorage:{getItem:key=>storage.get(key) || null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}});
  return module.exports;
}
function localToday() {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const value=type=>parts.find(p=>p.type===type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

test('schedules open at 5 PM Sri Lanka time on the previous day, including month and year boundaries',()=>{
  const {isScheduleAvailable,scheduleAvailableFrom}=load('data/scheduleAvailability.ts',async()=>{});
  const before=new Date('2026-10-04T16:59:59+05:30');
  const cutoff=new Date('2026-10-04T17:00:00+05:30');
  assert.equal(isScheduleAvailable('2026-10-05',before),false);
  assert.equal(isScheduleAvailable('2026-10-05',cutoff),true);
  assert.equal(isScheduleAvailable('2026-10-06',cutoff),false);
  assert.equal(isScheduleAvailable('2026-10-04',before),true);
  assert.equal(isScheduleAvailable('2026-10-03',before),true);
  assert.equal(scheduleAvailableFrom('2027-01-01').toISOString(),'2026-12-31T11:30:00.000Z');
  assert.equal(scheduleAvailableFrom('2026-11-01').toISOString(),'2026-10-31T11:30:00.000Z');
});

test('test login requires predefined credentials, notifies the route gate and resets on sign-out or reload',async()=>{
  const fetch=async()=>{throw new Error('Demo login must not need an API');};
  const login=load('data/signIn.ts',fetch);
  let changes=0;const unsubscribe=login.subscribeSignIn(()=>changes++);
  assert.equal(login.getSignedIn(),false);
  await assert.rejects(()=>login.signIn('dispatcher','wrong'),/Incorrect username or password/);
  await assert.rejects(()=>login.signIn('other',login.TEST_PASSWORD),/Incorrect username or password/);
  assert.equal(login.getSignedIn(),false);assert.equal(changes,0);
  await login.signIn(login.TEST_USERNAME,login.TEST_PASSWORD);
  assert.equal(login.getSignedIn(),true);assert.equal(changes,1);
  assert.equal(load('data/signIn.ts',fetch).getSignedIn(),false);
  login.signOut();assert.equal(login.getSignedIn(),false);assert.equal(changes,2);
  unsubscribe();login.signOut();assert.equal(changes,2);
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>login.signIn(login.TEST_USERNAME,login.TEST_PASSWORD,controller.signal));
  assert.equal(login.getSignedIn(),false);
});

test('API login mode opens the route gate only after a successful login response',async()=>{
  const login=load('data/signIn.ts',async(path,init)=>{
    assert.equal(path,'/api/auth/login');
    assert.equal(JSON.parse(init.body).username,'service-user');
    return json({success:true,data:{user:{username:'service-user'}}});
  },true,new Map(),'api');
  assert.equal(login.usesTestLogin,false);assert.equal(login.getSignedIn(),false);
  await login.signIn('service-user','service-password');assert.equal(login.getSignedIn(),true);
  const rejected=load('data/signIn.ts',async()=>new Response('{}',{status:401}),true,new Map(),'api');
  await assert.rejects(()=>rejected.signIn('service-user','wrong'));
  assert.equal(rejected.getSignedIn(),false);
});

test('API requests have no auth headers and successful empty responses stay empty',async()=>{
  const paths=[];
  const api=load('data/http.ts',async(path,init)=>{paths.push(path);assert.equal(init.headers.Authorization,undefined);return json({success:true,data:[]});});
  assert.equal((await api.request('/fleet/vehicles')).length,0);
  assert.equal(paths.length,1);assert.equal(api.getFallbackCount(),0);
});
test('unavailable APIs load file-backed data for every Dispatcher screen and detail flow',async()=>{
  let files=0;
  const {dispatcherRepository:repo}=load('data/dispatcherRepository.ts',async(path,init)=>{
    if(path==='/data/dispatcher.json'){files++;return new Response(fixture,{headers:{'Content-Type':'application/json'}});}
    assert.equal(init.headers.Authorization,undefined);return new Response('{}',{status:503});
  });
  const date=localToday();
  const orders=await repo.getOrders(date);assert.equal(orders.length,24);
  const deferred=orders.find(o=>o.status==='Deferred');
  const detail=await repo.getOrder(deferred.id);assert.ok(detail.items.length);assert.equal(detail.outletId,deferred.outletId);assert.equal(detail.itemsLoaded,true);
  const vehicles=await repo.getVehicles();assert.equal(vehicles.length,8);assert.equal(vehicles[0].trips.length,2);
  assert.equal(vehicles[0].weightCapacityKg,1500);assert.equal(vehicles[0].volumeCapacityM3,12);assert.equal(vehicles[0].weeklyFuelQuotaLitres,100);
  const fuel=await repo.getVehicleFuel('VEH001',date,'Peliyagoda');assert.equal(fuel.remaining,90);
  assert.ok(vehicles.find(v=>v.id==='VEH023').unavailableUntil);
  const schedule=await repo.getSchedule(date,'Peliyagoda');assert.equal(schedule.vehicles.length,6);assert.equal(schedule.deferred.length,12);assert.equal(schedule.fuel,0.1);
  const stop=schedule.vehicles[0].trips[0].stopDetails[0];assert.ok((await repo.getOrder(stop.orderRef)).items.length);
  const overview=await repo.getOverview(date);assert.equal(overview.categories[0].delivered,32);
  const nextWeek=new Date(`${date}T12:00:00Z`);nextWeek.setUTCDate(nextWeek.getUTCDate()+7);
  const windows=await repo.getWindows(date,nextWeek.toISOString().slice(0,10));assert.ok(windows.days.length);assert.ok(windows.days[0].cutoffAt.endsWith('Z'));
  assert.equal((await repo.getStatistics(date)).metrics[0].current,12);
  const forecast=await repo.getForecast(date);assert.equal(forecast.method,'file_test_data');assert.equal(forecast.days.length,5);
  const incidents=await repo.getIncidents();assert.equal(incidents.length,8);assert.equal((await repo.getIncident(incidents[0].id)).source,'VEH034');
  const tomorrow=new Date(`${date}T12:00:00Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  const later=new Date(tomorrow);later.setUTCDate(later.getUTCDate()+1);
  assert.equal((await repo.getOrders(tomorrow.toISOString().slice(0,10),later.toISOString().slice(0,10))).length,18);
  assert.equal(files,1);
});
test('cancellation does not fetch local files and fallback can be disabled',async()=>{
  let files=0;
  const controller=new AbortController();controller.abort();
  const api=load('data/http.ts',async(path,init)=>{if(path==='/data/dispatcher.json')files++;init.signal.throwIfAborted();});
  await assert.rejects(()=>api.request('/fleet/vehicles',controller.signal));assert.equal(files,0);
  const strict=load('data/http.ts',async()=>new Response('{}',{status:503}),false);
  await assert.rejects(()=>strict.request('/fleet/vehicles'),/503/);
});
test('failed file loading shows an error and resets its cache for retry',async()=>{
  let files=0;
  const api=load('data/http.ts',async(path)=>{
    if(path==='/data/dispatcher.json'){files++;return files===1 ? new Response('',{status:404}) : new Response(fixture);}
    return new Response('',{status:503});
  });
  await assert.rejects(()=>api.request('/fleet/vehicles'),/local Dispatcher test-data file/);
  assert.equal((await api.request('/fleet/vehicles')).length,8);assert.equal(files,2);
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
test('file-backed availability changes persist across reload and can be cleared',async()=>{
  const storage=new Map(),calls=[];
  const mock=async(path,init)=>{
    if(path==='/data/dispatcher.json')return new Response(fixture);
    calls.push({path,init});return new Response('{}',{status:404});
  };
  let repo=load('data/dispatcherRepository.ts',mock,true,storage).dispatcherRepository;
  const date=localToday();
  await repo.updateAvailability('VEH001',{status:'available',unavailable_periods:[{from:date,to:date}]});
  assert.equal(calls[0].path,'/api/fleet/vehicles/VEH001/availability');assert.equal(calls[0].init.method,'PUT');
  assert.equal((await repo.getVehicles()).find(v=>v.id==='VEH001').available,false);
  repo=load('data/dispatcherRepository.ts',mock,true,storage).dispatcherRepository;
  assert.equal((await repo.getVehicles()).find(v=>v.id==='VEH001').unavailableUntil,date);
  await repo.updateAvailability('VEH001',{status:'available',unavailable_periods:[]});
  assert.equal((await repo.getVehicles()).find(v=>v.id==='VEH001').available,true);
});
test('rejected availability writes and login failures never become successful file requests',async()=>{
  let files=0;
  const api=load('data/dispatcherRepository.ts',async(path)=>{if(path==='/data/dispatcher.json')files++;return json({success:false,error:{message:'Invalid request'}});}).dispatcherRepository;
  // The declared failure is surfaced even when the server incorrectly uses HTTP 200.
  await assert.rejects(()=>api.login('dispatcher','test-password'),/Invalid request/);
  await assert.rejects(()=>api.updateAvailability('VEH001',{status:'available',unavailable_periods:[]}),/Invalid request/);
  const rejected=load('data/dispatcherRepository.ts',async(path)=>{if(path==='/data/dispatcher.json')files++;return new Response(JSON.stringify({error:{message:'Not allowed'}}),{status:403});}).dispatcherRepository;
  await assert.rejects(()=>rejected.updateAvailability('VEH001',{status:'available',unavailable_periods:[]}),/Not allowed/);
  await assert.rejects(()=>rejected.login('dispatcher','test-password'),/Not allowed/);
  const offline=load('data/dispatcherRepository.ts',async(path)=>{if(path==='/data/dispatcher.json')files++;return new Response('{}',{status:503});}).dispatcherRepository;
  await assert.rejects(()=>offline.login('dispatcher','test-password'),/503/);
  assert.equal(files,0);
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

test('local availability overlays a legacy API list until server calendar fields exist',async()=>{
  let serverCalendar=false;
  const date=localToday();
  const repo=load('data/dispatcherRepository.ts',async(path)=>{
    if(path==='/data/dispatcher.json')return new Response(fixture);
    if(path==='/api/fleet/vehicles')return json({success:true,data:[{vehicle_id:'VEH001',depot:'Peliyagoda',type:'van',temp:'ambient',status:'available',...(serverCalendar ? {unavailable_periods:[]} : {})}]});
    return new Response('{}',{status:404});
  }).dispatcherRepository;
  await repo.updateAvailability('VEH001',{status:'available',unavailable_periods:[{from:date,to:date}]});
  assert.equal((await repo.getVehicles())[0].available,false);
  serverCalendar=true;
  assert.equal((await repo.getVehicles())[0].available,true);
});
