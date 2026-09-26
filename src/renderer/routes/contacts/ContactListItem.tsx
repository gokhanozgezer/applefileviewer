import type { CSSProperties } from 'react';
import type { Contact } from '@shared/domain';
import { L } from '../../i18n';
import { getInitials } from './initials';

interface Props {
  contact: Contact;
  selected: boolean;
  onSelect: (id: number) => void;
  /** react-window satır konumu (absolute top/height) — sanal listede zorunlu. */
  style?: CSSProperties;
}

export function ContactListItem({ contact, selected, onSelect, style }: Props) {
  const name = contact.displayName === '?' ? L.contacts.unnamed : contact.displayName;
  const initials = getInitials(contact.displayName);
  const sub = contact.organization || contact.phones[0] || contact.emails[0] || '';

  return (
    <li style={style}>
      <button
        type="button"
        onClick={() => onSelect(contact.id)}
        className={`flex h-full w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-fast ${
          selected
            ? 'border-l-2 border-accent bg-surface text-text'
            : 'text-text-muted hover:bg-surface hover:text-text'
        }`}
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent"
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text">{name}</span>
          {sub && <span className="block truncate text-xs text-text-muted">{sub}</span>}
        </span>
      </button>
    </li>
  );
}
