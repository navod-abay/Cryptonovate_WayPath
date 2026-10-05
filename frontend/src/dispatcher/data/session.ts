const KEY='dispatcher.session';
export interface Session { accessToken:string; refreshToken:string }
function read():Session|null {
  try{const saved=JSON.parse(sessionStorage.getItem(KEY) || 'null');return saved?.accessToken && saved?.refreshToken ? saved : null;}catch{return null;}
}
let current:Session|null=read();
export const getSession=()=>current;
export function setSession(session:Session|null) {
  current=session;
  try{if(session)sessionStorage.setItem(KEY,JSON.stringify(session));else sessionStorage.removeItem(KEY);}catch{/* storage unavailable: keep in memory only */}
}
