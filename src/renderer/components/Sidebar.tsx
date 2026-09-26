import { useNavigate, useParams, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Image,
  MessageSquare,
  MessageCircle,
  Phone,
  Voicemail,
  StickyNote,
  Mic,
  Users,
  ChevronLeft,
  Sun,
  Moon,
  MonitorCog,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Lock,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { lockBackup } from '../hooks/useBackups';
import { notify } from './ui/toast';
import { useTheme } from '../hooks/useTheme';
import { useUIStore } from '../store/uiStore';
import { formatShortcut, shortcutById } from '../keymap';
import { L } from '../i18n';

// Label render sırasında L.sidebar[m.key] ile çözülür — module-scope'ta metin
// YAKALANMAZ, dil değişiminde (remount) güncel sözlükten okunur.
const MODULES = [
  { key: 'overview', icon: LayoutDashboard, path: '' },
  { key: 'photos', icon: Image, path: 'photos' },
  { key: 'messages', icon: MessageSquare, path: 'messages' },
  { key: 'whatsapp', icon: MessageCircle, path: 'whatsapp' },
  { key: 'calls', icon: Phone, path: 'calls' },
  { key: 'voicemail', icon: Voicemail, path: 'voicemail' },
  { key: 'notes', icon: StickyNote, path: 'notes' },
  { key: 'voicememos', icon: Mic, path: 'voicememos' },
  { key: 'contacts', icon: Users, path: 'contacts' },
] as const;

// Tooltip'te platforma göre gösterim: Windows/Linux "Ctrl+B", macOS "⌘B".
function shortcutHint(id: string): string | undefined {
  const keys = shortcutById(id)?.keys;
  return keys ? formatShortcut(keys) : undefined;
}
const TOGGLE_KEYS = shortcutHint('toggle-sidebar');
const SETTINGS_KEYS = shortcutHint('open-settings');

/** Açık şifreli yedeği kilitler → yedek listesine döner + bildirim. */
function LockBackupButton({ udid, collapsed }: { udid: string; collapsed: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const onLock = async () => {
    // Önce listeye dön — modül ekranları kilitli yedeğe yeniden sorgu atmasın.
    navigate('/');
    const ok = await lockBackup(qc, udid);
    if (ok) notify.success(L.unlock.lockedToast);
    else notify.error(L.unlock.lockError);
  };
  return (
    <button
      type="button"
      onClick={() => void onLock()}
      title={L.unlock.lockAction}
      aria-label={L.unlock.lockAction}
      className={`mx-2 flex cursor-pointer items-center rounded-md py-2 text-sm font-medium text-text-muted transition-colors duration-fast hover:bg-surface hover:text-danger outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
        collapsed ? 'justify-center px-0' : 'gap-3 px-3'
      }`}
    >
      <Lock className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      {!collapsed && <span className="whitespace-nowrap">{L.unlock.lockAction}</span>}
    </button>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const { udid } = useParams<{ udid: string }>();
  const { themeMode, resolvedTheme, cycle } = useTheme();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const ThemeIcon = themeMode === 'system' ? MonitorCog : themeMode === 'light' ? Sun : Moon;
  const toggleLabel = collapsed ? L.sidebar.expand : L.sidebar.collapse;
  const toggleTitle = TOGGLE_KEYS ? `${toggleLabel} (${TOGGLE_KEYS})` : toggleLabel;
  const settingsTitle = SETTINGS_KEYS ? `${L.settings.title} (${SETTINGS_KEYS})` : L.settings.title;
  const activeBackup = useUIStore((s) => s.activeBackup);
  // Kilitle eylemi yalnız açık olan şifreli (kilidi açık) yedekte görünür.
  const canLock = udid !== undefined && activeBackup?.udid === udid && !!activeBackup.encrypted;

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden border-r border-border bg-surface-2 transition-[width] duration-medium ease-emphasized ${
        collapsed ? 'w-16' : 'w-[220px]'
      }`}
    >
      <button
        type="button"
        onClick={() => navigate('/')}
        title={collapsed ? L.sidebar.backToBackups : undefined}
        aria-label={L.sidebar.backToBackups}
        className={`flex cursor-pointer items-center gap-2 py-3 text-sm text-text-muted transition-colors duration-fast hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
          collapsed ? 'justify-center px-0' : 'px-4'
        }`}
      >
        <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={1.5} />
        {!collapsed && <span className="whitespace-nowrap">{L.sidebar.backToBackups}</span>}
      </button>

      {canLock && <LockBackupButton udid={udid} collapsed={collapsed} />}

      <nav aria-label={L.overview.modules} className="flex-1 space-y-0.5 px-2 py-2">
        {MODULES.map((m) => {
          const Icon = m.icon;
          const label = L.sidebar[m.key];
          // Yedek açık değilken (ör. /settings) modüller devre dışı — udid yok.
          if (udid === undefined) {
            return (
              <div
                key={m.key}
                aria-disabled="true"
                title={
                  collapsed ? `${label} — ${L.settings.requiresBackup}` : L.settings.requiresBackup
                }
                className={`flex cursor-not-allowed items-center rounded-md py-2 text-sm text-text-subtle ${
                  collapsed ? 'justify-center px-0' : 'gap-3 px-3'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                {!collapsed && <span className="whitespace-nowrap">{label}</span>}
              </div>
            );
          }
          const to = m.path ? `/backup/${udid}/${m.path}` : `/backup/${udid}`;
          return (
            <NavLink
              key={m.key}
              to={to}
              end={m.path === ''}
              title={collapsed ? label : undefined}
              aria-label={label}
              className={({ isActive }) =>
                `flex items-center rounded-md py-2 text-sm font-medium transition-colors duration-fast outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                  collapsed ? 'justify-center px-0' : 'gap-3 px-3'
                } ${
                  isActive
                    ? 'border-l-2 border-accent bg-surface text-text'
                    : 'text-text-muted hover:bg-surface hover:text-text'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`h-4 w-4 shrink-0 ${isActive ? 'text-accent' : ''}`}
                    strokeWidth={1.5}
                  />
                  {!collapsed && <span className="whitespace-nowrap">{label}</span>}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t border-border p-2">
        <NavLink
          to="/settings"
          title={settingsTitle}
          aria-label={L.settings.title}
          className={({ isActive }) =>
            `flex items-center rounded-md py-2 text-sm text-text-muted transition-colors duration-fast outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
              collapsed ? 'justify-center px-0' : 'gap-3 px-3'
            } ${
              isActive
                ? 'border-l-2 border-accent bg-surface font-medium text-text'
                : 'hover:bg-surface hover:text-text'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Settings
                className={`h-4 w-4 shrink-0 ${isActive ? 'text-accent' : ''}`}
                strokeWidth={1.5}
              />
              {!collapsed && <span className="whitespace-nowrap">{L.settings.title}</span>}
            </>
          )}
        </NavLink>
        <button
          type="button"
          onClick={cycle}
          title={collapsed ? L.sidebar.theme : undefined}
          aria-label={`${L.theme.cycleAria}: ${L.theme[themeMode]} (${resolvedTheme})`}
          className={`flex w-full cursor-pointer items-center rounded-md py-2 text-sm text-text-muted transition-colors duration-fast hover:bg-surface hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
            collapsed ? 'justify-center px-0' : 'gap-3 px-3'
          }`}
        >
          <ThemeIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          {!collapsed && <span className="whitespace-nowrap">{L.sidebar.theme}</span>}
        </button>
        <button
          type="button"
          onClick={toggleSidebar}
          title={toggleTitle}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          className={`flex w-full cursor-pointer items-center rounded-md py-2 text-sm text-text-muted transition-colors duration-fast hover:bg-surface hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
            collapsed ? 'justify-center px-0' : 'gap-3 px-3'
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          ) : (
            <PanelLeftClose className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          )}
          {!collapsed && <span className="whitespace-nowrap">{toggleLabel}</span>}
        </button>
      </div>
    </aside>
  );
}
