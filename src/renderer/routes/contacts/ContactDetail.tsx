import { format } from 'date-fns';
import { Phone, Mail, MapPin, Cake, Building2, StickyNote, Copy } from 'lucide-react';
import type { Contact } from '@shared/domain';
import { L } from '../../i18n';
import { dateLocale } from '../../i18n/dateLocale';
import { copyToClipboard } from '../../components/ui/toast';
import { getInitials } from './initials';

interface Props {
  contact: Contact;
}

function fmtBirthday(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return format(new Date(iso), 'd MMMM', { locale: dateLocale() });
  } catch {
    return null;
  }
}

function CopyableRow({ value }: { value: string }) {
  // Hata artık yutulmaz — copyToClipboard başarısızlıkta "kopyalanamadı" bildirir.
  const copy = () => void copyToClipboard(value, L.contacts.copied);
  return (
    <li className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
      <span className="min-w-0 flex-1 truncate text-sm text-text" title={value}>
        {value}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={L.contacts.copyAria}
        title={L.contacts.copyAria}
        className="shrink-0 cursor-pointer rounded p-1 text-text-subtle opacity-0 transition-opacity duration-fast hover:text-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
    </li>
  );
}

function Section({
  icon: Icon,
  label,
  values,
}: {
  icon: typeof Phone;
  label: string;
  values: string[];
}) {
  if (values.length === 0) return null;
  return (
    <section className="mt-5">
      <h2 className="flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-text-subtle">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
        {label}
      </h2>
      <ul className="mt-1 space-y-0.5">
        {values.map((v, i) => (
          <CopyableRow key={`${v}-${i}`} value={v} />
        ))}
      </ul>
    </section>
  );
}

export function ContactDetail({ contact }: Props) {
  const name = contact.displayName === '?' ? L.contacts.unnamed : contact.displayName;
  const initials = getInitials(contact.displayName);
  const birthday = fmtBirthday(contact.birthdayIso);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-8 py-8">
        <div className="flex flex-col items-center text-center">
          <span
            aria-hidden
            className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/15 text-2xl font-semibold text-accent"
          >
            {initials}
          </span>
          <h1 className="mt-3 max-w-full break-words text-2xl font-semibold text-text">{name}</h1>
          {contact.jobTitle && <p className="mt-0.5 text-sm text-text-muted">{contact.jobTitle}</p>}
          {contact.organization && (
            <p className="flex items-center gap-1.5 text-sm text-text-muted">
              <Building2
                className="h-3.5 w-3.5"
                strokeWidth={1.5}
                role="img"
                aria-label={L.contacts.organizationLabel}
              />
              {contact.organization}
            </p>
          )}
        </div>

        <Section icon={Phone} label={L.contacts.phonesLabel} values={contact.phones} />
        <Section icon={Mail} label={L.contacts.emailsLabel} values={contact.emails} />
        <Section icon={MapPin} label={L.contacts.addressesLabel} values={contact.addresses} />

        {birthday && (
          <section className="mt-5">
            <h2 className="flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-text-subtle">
              <Cake className="h-3.5 w-3.5" strokeWidth={1.5} />
              {L.contacts.birthdayLabel}
            </h2>
            <p className="px-2 py-1.5 text-sm text-text">{birthday}</p>
          </section>
        )}

        {contact.note && (
          <section className="mt-5">
            <h2 className="flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-text-subtle">
              <StickyNote className="h-3.5 w-3.5" strokeWidth={1.5} />
              {L.contacts.noteLabel}
            </h2>
            <p className="whitespace-pre-wrap px-2 py-1.5 text-sm leading-relaxed text-text">
              {contact.note}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
