import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, SignOut, WarningCircle } from '@phosphor-icons/react';
import { PrimaryButton } from '@waypoint/ui';
import Card from '@/components/Card';
import TypeIcon from '@/components/TypeIcon';
import KeyValueList from '@/components/KeyValueList';
import { useAppStore } from '@/state/store';
import { changePassword, logout, AuthError } from '@/api/authApi';
import { CATEGORY, STORE_TYPE_LABEL } from '@/config/categories';
import { formatLongDate, fromISODate } from '@/utils/date';
import './ProfilePage.css';

const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export default function ProfilePage() {
  const navigate = useNavigate();
  const session = useAppStore((s) => s.session);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!session) return null;
  const { user, outlet } = session;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { setMsg({ ok: false, text: 'New passwords do not match.' }); return; }
    setBusy(true);
    try {
      await changePassword(current, next, confirm);
      setMsg({ ok: true, text: 'Password changed.' });
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      setMsg({ ok: false, text: err instanceof AuthError ? err.message : 'Could not change the password.' });
    }
    setBusy(false);
  };

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <main className="sm-page sm-profile">
      <Card className="sm-profile__me">
        <div className="sm-profile__head">
          <span className="sm-profile__avatar" aria-hidden>{initials(user.fullName)}</span>
          <div>
            <h1 className="sm-profile__name">{user.fullName}</h1>
            <p className="sm-profile__role">Store Manager · {outlet.id}</p>
          </div>
        </div>
        <hr className="sm-divider" />
        <KeyValueList
          rows={[
            { key: 'u', label: 'Username', value: user.username },
            { key: 'e', label: 'Email', value: user.email ?? '–' },
            { key: 'p', label: 'Phone', value: user.phone ?? '–' },
            { key: 'm', label: 'Member since', value: user.memberSince ? formatLongDate(fromISODate(user.memberSince.slice(0, 10))) : '–' },
          ]}
        />
        <div className="sm-profile__signout">
          <PrimaryButton
            title="Log out"
            variant="outline"
            onClick={signOut}
            iconLeft={<SignOut size={28} />}
            style={{ borderColor: 'var(--sm-maroon-500)', color: 'var(--sm-maroon-500)', borderRadius: 16, minHeight: 72, fontSize: 22, fontWeight: 500, borderWidth: 2 }}
          />
        </div>
      </Card>

      <div className="sm-profile__side">
        <Card>
          <h2 className="sm-profile__h2">Your Store</h2>
          <div className="sm-profile__store">
            <span className="sm-profile__icons">
              {outlet.categories.map((c) => <TypeIcon key={c} type={c} size={64} />)}
            </span>
            <div>
              <p className="sm-profile__store-name">{outlet.storeName}</p>
              <p className="sm-muted">{STORE_TYPE_LABEL[outlet.storeType]}</p>
            </div>
          </div>
          <KeyValueList
            rows={[
              { key: 'o', label: 'Outlet', value: outlet.id },
              { key: 'c', label: 'City', value: outlet.city },
              { key: 'a', label: 'Address', value: outlet.address || '–' },
              { key: 'k', label: 'Order types', value: outlet.categories.map((c) => CATEGORY[c].short).join(', ') },
            ]}
          />
        </Card>

        <Card>
          <h2 className="sm-profile__h2">Change Password</h2>
          <form className="sm-profile__form" onSubmit={submit}>
            <label>Current password<input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></label>
            <label>New password<input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></label>
            <label>Confirm new password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></label>
            {msg && (
              <p className={`sm-profile__msg${msg.ok ? ' is-ok' : ''}`} role="status">
                {msg.ok ? <CheckCircle size={20} weight="fill" /> : <WarningCircle size={20} weight="fill" />} {msg.text}
              </p>
            )}
            <PrimaryButton
              type="submit"
              title="Update Password"
              onClick={() => undefined}
              disabled={!current || !next || !confirm}
              isLoading={busy}
              style={{ borderRadius: 16, minHeight: 64, fontSize: 20 }}
            />
          </form>
        </Card>
      </div>
    </main>
  );
}
