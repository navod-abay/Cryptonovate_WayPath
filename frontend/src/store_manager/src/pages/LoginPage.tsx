import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeSlash, WarningCircle } from '@phosphor-icons/react';
import { PrimaryButton } from '@waypoint/ui';
import { login, AuthError, demoAccounts } from '@/api/authApi';
import { STORE_TYPE_LABEL } from '@/config/categories';
import { useNow } from '@/hooks/useNow';
import { formatClock, formatDayMonth } from '@/utils/date';
import './LoginPage.css';

/** Store manager sign-in. Layout follows the loader login in Figma (navy panel + form panel). */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const now = useNow(30_000);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const demo = demoAccounts();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof AuthError ? err.message : (err as Error)?.message || 'Could not sign in. Check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <main className="sm-login">
      <section className="sm-login__brand">
        <div>
          <p className="sm-login__logo">WayPath</p>
          <p className="sm-login__role">Store Manager</p>
        </div>
        <div className="sm-login__clock">
          <p className="sm-login__time">{formatClock(now)}</p>
          <p className="sm-login__date">{formatDayMonth(now)}</p>
        </div>
      </section>

      <section className="sm-login__panel">
        <form className="sm-login__form" onSubmit={submit} noValidate>
          <h1 className="sm-login__title">Sign in</h1>
          <p className="sm-login__hint">Use the username and password given to your outlet.</p>

          <label className="sm-login__field">
            <span>Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              placeholder="e.g. manager_out015"
            />
          </label>

          <label className="sm-login__field">
            <span>Password</span>
            <span className="sm-login__pw">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeSlash size={26} /> : <Eye size={26} />}
              </button>
            </span>
          </label>

          {error && (
            <p className="sm-login__error" role="alert"><WarningCircle size={22} weight="fill" /> {error}</p>
          )}

          <PrimaryButton
            type="submit"
            title="Sign In"
            onClick={() => undefined}
            isLoading={busy}
            style={{ borderRadius: 16, minHeight: 85, fontSize: 24, fontWeight: 500 }}
          />

          {demo.length > 0 && (
          <div className="sm-login__demo">
            <p>Demo accounts (password <code>Password123!</code>)</p>
            <ul>
              {demo.map((a) => (
                <li key={a.username}>
                  <button type="button" onClick={() => { setUsername(a.username); setPassword(a.password); setError(null); }}>
                    {a.username}
                  </button>
                  <span>{STORE_TYPE_LABEL[a.storeType]} · {a.outletId}</span>
                </li>
              ))}
            </ul>
          </div>
          )}
        </form>
      </section>
    </main>
  );
}
