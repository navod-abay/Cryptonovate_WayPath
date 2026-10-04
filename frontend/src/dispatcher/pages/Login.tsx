import { useEffect,useRef,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight,Eye,EyeOff,LockKeyhole,MapPin,Route,Truck,UserRound } from 'lucide-react';
import { PrimaryButton } from '@waypoint/ui';
import { signIn } from '../data/signIn';

export default function Login() {
  const navigate=useNavigate();const controller=useRef<AbortController>();
  const [username,setUsername]=useState(''),[password,setPassword]=useState('');
  const [visible,setVisible]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>()=>controller.current?.abort(),[]);
  return <main className="login-screen"><section className="login-story" aria-label="WayPath Dispatcher">
    <div className="login-brand"><span><Route size={28} /></span>WayPath</div>
    <div className="login-story-copy"><span className="login-eyebrow">DISPATCHER WORKSPACE</span><h1>A clearer path<br />for every delivery.</h1><p>Keep your fleet, orders and schedules moving together.</p>
      <div className="login-route-art" aria-hidden="true"><svg viewBox="0 0 430 200"><path d="M40 155 H125 Q165 155 165 115 V80 Q165 40 205 40 H320 Q375 40 375 95 V140" fill="none" stroke="#55d3f3" strokeWidth="3" strokeDasharray="7 9" /><circle cx="40" cy="155" r="10" fill="#55d3f3" /><circle cx="375" cy="140" r="10" fill="#b4f8d0" /></svg><span className="route-art-truck"><Truck size={40} /></span><span className="route-art-pin"><MapPin size={27} /></span><span className="route-art-label">Every stop. One connected plan.</span></div>
    </div><p className="login-story-footer">Built for the people behind the journey.</p>
  </section><section className="login-form-side"><form className="login-form" onSubmit={async event=>{
    event.preventDefault();setError('');
    if(!username.trim()){setError('Enter your username.');return;}
    setBusy(true);controller.current=new AbortController();
    try{await signIn(username,password,controller.current.signal);setPassword('');navigate('/dispatcher',{replace:true});}
    catch(error){if(!controller.current.signal.aborted){setError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.');}}
    finally{setBusy(false);}
  }}>
    <span className="login-form-icon"><Truck size={26} /></span><span className="login-eyebrow">WELCOME TO WAYPATH</span><h2>Sign in to Dispatcher</h2><p className="login-intro">Your next delivery day starts here.</p>
    <label htmlFor="dispatcher-username">Username</label><div className="login-input"><UserRound size={20} /><input id="dispatcher-username" name="username" autoComplete="username" placeholder="Enter your username" required maxLength={100} disabled={busy} value={username} onChange={event=>setUsername(event.target.value)} /></div>
    <label htmlFor="dispatcher-password">Password</label><div className="login-input"><LockKeyhole size={20} /><input id="dispatcher-password" name="password" autoComplete="current-password" type={visible ? 'text' : 'password'} placeholder="Enter your password" required disabled={busy} value={password} onChange={event=>setPassword(event.target.value)} /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} className="icon-button" onClick={()=>setVisible(value=>!value)}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}<PrimaryButton title="Sign in" type="submit" isLoading={busy} iconRight={<ArrowRight size={21} />} onClick={()=>{}} className="login-submit" />
    <p className="login-footer">WayPath · Dispatcher</p>
  </form></section></main>;
}
