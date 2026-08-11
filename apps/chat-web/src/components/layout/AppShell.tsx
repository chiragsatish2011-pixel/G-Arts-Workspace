import { useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import {
  Users,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Search,
  WifiOff,
  Bell,
  BellOff,
  Menu,
  X,
  UserCircle2,
  ExternalLink,
  CircleDot,
  ChevronsUpDown,
  Check
} from 'lucide-react';
import { cn } from '@g-arts/chat-shared';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { useChatStore } from '../../stores/chat';
import { onConnectionState, type ConnectionState } from '../../lib/socket';
import { Avatar, Tooltip, spring } from '../ui';
import { Monogram } from '../ui/Logo';
import { isEmbedded, reportUnread } from '../../lib/embed';
import { ConversationList } from './ConversationList';
import { NewConversationModal } from '../overlays/NewConversation';
import { ProfileSheet } from '../overlays/ProfileSheet';

/**
 * Three columns, flush against one another, separated by hairlines:
 *
 *   sidebar (warm paper) │ conversation (white) │ details (warm paper)
 *
 * The earlier version floated every column as its own rounded card on a padded
 * background, plus a fourth icon rail. That is four seams and a lot of chrome
 * for an app whose job is to show one column of text. Everything the rail held
 * now lives in the account menu, where people already look for settings.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const conversations = useChatStore((s) => s.conversations);
  const { theme, setTheme, setPalette, sidebarOpen, setSidebar, soundEnabled, toggleSound } =
    useUIStore();
  const location = useLocation();

  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [menuOpen, setMenuOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onConnectionState(setConnection);
    return () => {
      unsubscribe();
    };
  }, []);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  useEffect(() => {
    if (isEmbedded) {
      // The Workspace owns the tab title and shows the badge in its own nav.
      reportUnread(totalUnread);
      return;
    }
    document.title = totalUnread > 0 ? `(${totalUnread}) Gurukul Chat` : 'Gurukul Chat';
  }, [totalUnread]);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebar(false)}
            className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* Sidebar                                                              */}
      {/* ------------------------------------------------------------------ */}
      <aside
        className={cn(
          'panel-dark z-40 flex w-[300px] shrink-0 flex-col bg-canvas',
          'fixed inset-y-0 left-0 shadow-float transition-transform duration-300 ease-spring',
          'md:relative md:translate-x-0 md:shadow-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand — omitted when the Workspace shell already shows it. */}
        <div
          className={cn(
            'flex shrink-0 items-center gap-3 px-4',
            isEmbedded ? 'h-14 justify-end' : 'h-[68px]'
          )}
        >
          {!isEmbedded && (
          <Link to="/" className="flex min-w-0 items-center gap-3" title="Gurukul Chat">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/95">
              <Monogram size={28} />
            </span>
            <span className="min-w-0 leading-none">
              <span className="block truncate font-display text-[17px] font-semibold tracking-tight text-ink">
                Gurukul
              </span>
              <span className="mt-1 block text-[9.5px] font-medium uppercase tracking-[0.22em] text-ink-faint">
                Chat
              </span>
            </span>
          </Link>
          )}

          <div className="ml-auto flex items-center gap-0.5">
            <Tooltip label="Search  ⌘K">
              <button
                onClick={() => setPalette(true)}
                className="grid h-9 w-9 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-sunken hover:text-ink"
                aria-label="Search"
              >
                <Search size={17} />
              </button>
            </Tooltip>
            <button
              onClick={() => setSidebar(false)}
              className="grid h-9 w-9 place-items-center rounded-lg text-ink-faint hover:bg-sunken md:hidden"
              aria-label="Close"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Offline notice: shown only when something is actually wrong, rather
            than a permanent status light for the normal case. */}
        <AnimatePresence>
          {(connection === 'reconnecting' || connection === 'offline') && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mx-3 mb-2 overflow-hidden rounded-lg bg-gold/12"
            >
              <p className="flex items-center gap-2 px-3 py-2 text-[12px] text-ink-soft">
                <WifiOff size={13} className="shrink-0 text-gold" />
                {connection === 'offline'
                  ? 'Not connected. Messages will send when you are back.'
                  : 'Reconnecting…'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="min-h-0 flex-1">
          <ConversationList onNewConversation={() => setNewOpen(true)} />
        </div>

        {/* Account */}
        <div className="relative shrink-0 p-2">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors',
              menuOpen ? 'bg-sunken' : 'hover:bg-sunken'
            )}
          >
            <Avatar
              name={user?.displayName ?? '?'}
              src={user?.avatarUrl}
              accent={user?.accentColor}
              size="md"
              online
              status={user?.status}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-ink">
                {user?.displayName}
              </span>
              <span className="block truncate text-[11.5px] text-ink-faint">
                {user?.statusText || (user?.role === 'admin' ? 'Administrator' : 'Member')}
              </span>
            </span>
            <ChevronsUpDown size={14} className="shrink-0 text-ink-faint" />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.99 }}
                  transition={spring}
                  className="absolute bottom-full left-2 right-2 z-20 mb-1 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop"
                >
                  <a
                    href={`${import.meta.env.VITE_WORKSPACE_URL ?? 'http://localhost:5174'}/#profile`}
                    target={isEmbedded ? '_parent' : '_self'}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
                  >
                    <UserCircle2 size={15} /> Profile settings
                    <ExternalLink size={12} className="ml-auto opacity-50" />
                  </a>
                  <MenuRow
                    icon={<CircleDot size={15} />}
                    label="Set your status"
                    onClick={() => {
                      setProfileOpen(true);
                      setMenuOpen(false);
                    }}
                  />
                  {user?.role === 'admin' && !isEmbedded && (
                    <a
                      href={import.meta.env.VITE_WORKSPACE_URL ?? 'http://localhost:5174'}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
                    >
                      <Users size={15} /> Manage members in Workspace
                    </a>
                  )}

                  <div className="my-1 h-px bg-line-soft" />

                  <MenuRow
                    icon={soundEnabled ? <Bell size={15} /> : <BellOff size={15} />}
                    label={soundEnabled ? 'Sounds on' : 'Sounds off'}
                    onClick={toggleSound}
                    trailing={soundEnabled ? <Check size={13} className="text-brand" /> : undefined}
                  />

                  <div className="px-3 pb-1 pt-2">
                    <p className="eyebrow mb-1.5">Appearance</p>
                    <div className="flex gap-1">
                      {(
                        [
                          ['light', <Sun key="l" size={14} />],
                          ['dark', <Moon key="d" size={14} />],
                          ['system', <Monitor key="s" size={14} />]
                        ] as const
                      ).map(([value, icon]) => (
                        <button
                          key={value}
                          onClick={() => setTheme(value)}
                          title={value}
                          className={cn(
                            'flex flex-1 items-center justify-center rounded-lg py-1.5 transition-colors',
                            theme === value
                              ? 'bg-brand-soft text-brand'
                              : 'text-ink-faint hover:bg-sunken hover:text-ink'
                          )}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="my-1 h-px bg-line-soft" />

                  {/* Signing out belongs to the Workspace; doing it here would
                      leave the shell holding a session chat no longer trusts. */}
                  {!isEmbedded && (
                    <MenuRow
                      icon={<LogOut size={15} />}
                      label="Sign out"
                      destructive
                      onClick={() => void logout()}
                    />
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </aside>

      <div className="rule-v hidden md:block" />

      {/* ------------------------------------------------------------------ */}
      {/* Conversation                                                         */}
      {/* ------------------------------------------------------------------ */}
      <main className="relative flex min-w-0 flex-1 flex-col bg-canvas">
        <button
          onClick={() => setSidebar(true)}
          className="absolute left-3 top-4 z-30 grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-sunken md:hidden"
          aria-label="Open chats"
        >
          <Menu size={19} />
        </button>
        {children}
      </main>

      <NewConversationModal open={newOpen} onClose={() => setNewOpen(false)} />
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
  destructive,
  trailing
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors',
        destructive
          ? 'text-danger hover:bg-danger/10'
          : 'text-ink-soft hover:bg-sunken hover:text-ink'
      )}
    >
      {icon}
      {label}
      {trailing && <span className="ml-auto">{trailing}</span>}
    </button>
  );
}
