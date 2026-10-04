import { dispatcherRepository } from './dispatcherRepository';
import { clearTokens,setTokens } from './session';

const listeners = new Set<() => void>();
let signedIn = false;

export const subscribeSignIn = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getSignedIn = () => signedIn;
function update(value: boolean) {
  signedIn = value;
  listeners.forEach(listener => listener());
}
export function signOut() { clearTokens(); update(false); }
export async function signIn(username: string, password: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  setTokens(await dispatcherRepository.login(username.trim(), password, signal) as { access_token?: string; refresh_token?: string });
  signal?.throwIfAborted();
  update(true);
}
