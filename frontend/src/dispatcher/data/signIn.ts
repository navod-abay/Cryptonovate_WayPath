import { dispatcherRepository } from './dispatcherRepository';
import { setUnauthorizedHandler } from './http';
import { getSession, setSession } from './session';

// Public test credentials only. This UI gate is not backend authentication.
export const TEST_USERNAME = 'dispatcher';
export const TEST_PASSWORD = 'Dispatcher123!';
export const usesTestLogin = import.meta.env.VITE_LOGIN_MODE === 'demo';
interface LoginResponse { access_token:string; refresh_token:string; user?:{ role?:string } }
const listeners = new Set<() => void>();
let signedIn = !usesTestLogin && getSession() !== null;

export const subscribeSignIn = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getSignedIn = () => signedIn;
function update(value: boolean) {
  signedIn = value;
  listeners.forEach(listener => listener());
}
export function signOut() { setSession(null); update(false); }
setUnauthorizedHandler(signOut);
export async function signIn(username: string, password: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (usesTestLogin) {
    if (username.trim() !== TEST_USERNAME || password !== TEST_PASSWORD) {
      throw new Error('Incorrect username or password. Use the test account shown below.');
    }
  } else {
    const result = await dispatcherRepository.login(username.trim(), password, signal) as LoginResponse;
    if (result.user?.role !== 'dispatcher') throw new Error('This app is for dispatchers only.');
    if (!result.access_token || !result.refresh_token) throw new Error('Sign-in failed. Please try again.');
    signal?.throwIfAborted();
    setSession({ accessToken: result.access_token, refreshToken: result.refresh_token });
  }
  signal?.throwIfAborted();
  update(true);
}
