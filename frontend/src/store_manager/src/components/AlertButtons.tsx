import type { Update, UpdateSource } from '@/types';
import { SOURCE_ICON } from './UpdateItem';
import './AlertButtons.css';

const LABEL: Record<UpdateSource, string> = {
  dispatcher: 'Dispatcher Alerts',
  loader: 'Loader Alerts',
  driver: 'Driver Alerts',
};

interface Props {
  updates: Update[];
  active: UpdateSource | null;
  onToggle: (s: UpdateSource) => void;
}

/** Filters Recent Updates by who raised them; shows unread counts. */
export default function AlertButtons({ updates, active, onToggle }: Props) {
  return (
    <div className="sm-alerts">
      {(['dispatcher', 'loader', 'driver'] as UpdateSource[]).map((s) => {
        const Icon = SOURCE_ICON[s];
        const unread = updates.filter((u) => u.source === s && !u.read).length;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active === s}
            className={`sm-alerts__btn${active === s ? ' is-active' : ''}`}
            onClick={() => onToggle(s)}
          >
            <Icon size={30} aria-hidden />
            {LABEL[s]}
            {unread > 0 && <span className="sm-alerts__count">({unread})</span>}
          </button>
        );
      })}
    </div>
  );
}
