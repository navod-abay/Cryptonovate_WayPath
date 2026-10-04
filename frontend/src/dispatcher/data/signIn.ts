import { dispatcherRepository } from './dispatcherRepository';

// Public test credentials only. This UI gate is not backend authentication.
export const TEST_USERNAME = 'dispatcher';
export const TEST_PASSWORD = 'Dispatcher123!';
export const usesTestLogin = import.meta.env.VITE_LOGIN_MODE !== 'api';
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
export function signOut() { update(false); }
export async function signIn(username: string, password: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (usesTestLogin) {
    if (username.trim() !== TEST_USERNAME || password !== TEST_PASSWORD) {
      throw new Error('Incorrect username or password. Use the test account shown below.');
    }
  } else {
    await dispatcherRepository.login(username.trim(), password, signal);
  }
  signal?.throwIfAborted();
  update(true);
}
