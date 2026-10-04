import { PersonArmsSpread, UserCircleGear, Van } from '@phosphor-icons/react';
import type { Update, UpdateSource } from '@/types';
import './UpdateItem.css';

export const SOURCE_ICON: Record<UpdateSource, typeof Van> = {
  driver: Van,
  dispatcher: UserCircleGear,
  loader: PersonArmsSpread,
};

export default function UpdateItem({ update, time, onOpen }: { update: Update; time: string; onOpen?: () => void }) {
  const Icon = SOURCE_ICON[update.source];
  const Tag = onOpen ? 'button' : 'div';
  return (
    <Tag
      type={onOpen ? 'button' : undefined}
      className={`sm-update${update.read ? '' : ' is-unread'}${onOpen ? ' is-link' : ''}`}
      onClick={onOpen}
    >
      <Icon size={30} className="sm-update__icon" aria-label={update.source} />
      <span className="sm-update__msg">{update.message}</span>
      <time className="sm-update__time" dateTime={update.at}>{time}</time>
    </Tag>
  );
}
