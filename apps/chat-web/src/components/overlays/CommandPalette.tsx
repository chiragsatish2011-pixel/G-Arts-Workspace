import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Hash,
  MessageSquare,
  Users,
  Sun,
  Moon,
  Pin,
  CornerDownLeft,
  Lock,
  Megaphone
} from 'lucide-react';
import { cn, type Conversation, type User } from '@g-arts/chat-shared';
import { useChatStore } from '../../stores/chat';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { Avatar, spring } from '../ui';

type Entry =
  | { kind: 'conversation'; id: string; label: string; sub: string; data: Conversation }
  | { kind: 'person'; id: string; label: string; sub: string; data: User }
  | { kind: 'action'; id: string; label: string; sub: string; run: () => void; icon: React.ReactNode };

/**
 * ⌘K jump-to. One box that reaches every room, every person and the handful of
 * settings people actually change — the fastest path in the whole app.
 */
export function CommandPalette() {
  const open = useUIStore((s) => s.paletteOpen);
  const setPalette = useUIStore((s) => s.setPalette);
  const { theme, setTheme, setPanel } = useUIStore();
  const conversations = useChatStore((s) => s.conversations);
  const users = useChatStore((s) => s.users);
  const openConversation = useChatStore((s) => s.openConversation);
  const openDirect = useChatStore((s) => s.openDirect);
  const me = useAuthStore((s) => s.user);

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Global shortcut. Registered once at the app root rather than per screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette(!useUIStore.getState().paletteOpen);
      }
      if (event.key === 'Escape') setPalette(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPalette]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const needle = query.trim().toLowerCase();
    const match = (text: string) => text.toLowerCase().includes(needle);

    const conversationEntries: Entry[] = conversations
      .filter((c) => !needle || match(c.name))
      .slice(0, 8)
      .map((c) => ({
        kind: 'conversation',
        id: c.id,
        label: c.name,
        sub:
          c.kind === 'dm'
            ? 'Direct message'
            : c.unreadCount > 0
              ? `${c.unreadCount} unread`
              : c.description || 'Channel',
        data: c
      }));

    const openDmIds = new Set(
      conversations.filter((c) => c.kind === 'dm').map((c) => c.counterpart?.id)
    );

    const personEntries: Entry[] = users
      .filter((u) => u.id !== me?.id && !openDmIds.has(u.id))
      .filter((u) => !needle || match(u.displayName) || match(u.username))
      .slice(0, 6)
      .map((u) => ({
        kind: 'person',
        id: u.id,
        label: u.displayName,
        sub: u.isConnected ? (u.statusText ?? 'Online') : `@${u.username}`,
        data: u
      }));

    const actionEntries: Entry[] = (
      [
        {
          id: 'theme',
          label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
          sub: 'Appearance',
          icon: theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />,
          run: () => setTheme(theme === 'dark' ? 'light' : 'dark')
        },
        {
          id: 'people',
          label: 'Show who is in this chat',
          sub: 'Side panel',
          icon: <Users size={15} />,
          run: () => setPanel('people')
        },
        {
          id: 'search',
          label: 'Search messages',
          sub: 'Side panel',
          icon: <Search size={15} />,
          run: () => setPanel('search')
        },
        {
          id: 'pinned',
          label: 'Show pinned messages',
          sub: 'Side panel',
          icon: <Pin size={15} />,
          run: () => setPanel('pinned')
        }
      ] as const
    )
      .filter((a) => !needle || match(a.label))
      .map((a) => ({ kind: 'action' as const, ...a }));

    return [...conversationEntries, ...personEntries, ...actionEntries];
  }, [query, conversations, users, me?.id, theme, setTheme, setPanel]);

  const choose = (entry: Entry) => {
    setPalette(false);
    if (entry.kind === 'conversation') void openConversation(entry.id);
    else if (entry.kind === 'person') void openDirect(entry.id);
    else entry.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, entries.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (event.key === 'Enter' && entries[cursor]) {
      event.preventDefault();
      choose(entries[cursor]);
    }
  };

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPalette(false)}
            className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={spring}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={17} className="shrink-0 text-ink-faint" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Jump to a chat, a person, or a setting…"
                className="h-14 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <kbd className="shrink-0 rounded border border-line px-1.5 py-0.5 text-2xs text-ink-faint">
                Esc
              </kbd>
            </div>

            <div ref={listRef} className="scroll-slim max-h-[52vh] overflow-y-auto p-2">
              {entries.length === 0 && (
                <p className="py-10 text-center text-[13px] text-ink-faint">
                  Nothing matches that.
                </p>
              )}

              {entries.map((entry, index) => (
                <button
                  key={`${entry.kind}-${entry.id}`}
                  data-index={index}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => choose(entry)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    index === cursor ? 'bg-sunken' : 'hover:bg-sunken/60'
                  )}
                >
                  <EntryIcon entry={entry} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">
                      {entry.label}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-faint">{entry.sub}</span>
                  </span>
                  {index === cursor && (
                    <CornerDownLeft size={14} className="shrink-0 text-ink-faint" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-2xs text-ink-faint">
              <span>
                <kbd className="rounded border border-line px-1">↑</kbd>{' '}
                <kbd className="rounded border border-line px-1">↓</kbd> navigate
              </span>
              <span>
                <kbd className="rounded border border-line px-1">↵</kbd> open
              </span>
              <span className="ml-auto">{entries.length} results</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function EntryIcon({ entry }: { entry: Entry }) {
  if (entry.kind === 'person') {
    return (
      <Avatar
        name={entry.data.displayName}
        src={entry.data.avatarUrl}
        accent={entry.data.accentColor}
        size="sm"
        online={entry.data.isConnected}
      />
    );
  }

  if (entry.kind === 'action') {
    return (
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sunken text-ink-soft">
        {entry.icon}
      </span>
    );
  }

  const conversation = entry.data;
  if (conversation.kind === 'dm' && conversation.counterpart) {
    return (
      <Avatar
        name={conversation.counterpart.displayName}
        src={conversation.counterpart.avatarUrl}
        accent={conversation.counterpart.accentColor}
        size="sm"
        online={conversation.counterpart.isConnected}
      />
    );
  }

  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
      {conversation.kind === 'group' ? (
        <Users size={15} />
      ) : conversation.type === 'announcement' ? (
        <Megaphone size={15} />
      ) : conversation.isPrivate ? (
        <Lock size={15} />
      ) : (
        <Hash size={15} />
      )}
    </span>
  );
}
