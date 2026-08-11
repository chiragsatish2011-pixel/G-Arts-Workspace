import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Hash,
  Lock,
  Megaphone,
  Volume2,
  Users,
  Search,
  Star,
  BellOff,
  Bell,
  PanelRight,
  Check
} from 'lucide-react';
import { cn, timeAgo, type Conversation } from '@g-arts/chat-shared';
import { useChatStore } from '../../stores/chat';
import { useUIStore } from '../../stores/ui';
import { Avatar, Tooltip, spring } from '../ui';
import api from '../../lib/api';

/** Plain-language mute choices instead of a single on/off toggle. */
const MUTE_OPTIONS: Array<{ label: string; hours: number | null }> = [
  { label: 'For 1 hour', hours: 1 },
  { label: 'For 8 hours', hours: 8 },
  { label: 'Until tomorrow', hours: 24 },
  { label: 'Until I turn it back on', hours: null }
];

export function ChatHeader({ conversation }: { conversation: Conversation }) {
  const { panel, togglePanel, setPanel } = useUIStore();
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const typing = useChatStore((s) => s.typing[conversation.id] ?? []);
  const [muteMenu, setMuteMenu] = useState(false);

  const isDirect = conversation.kind === 'dm';
  const counterpart = conversation.counterpart;
  const muted =
    conversation.notifyLevel === 'none' ||
    (conversation.mutedUntil ? new Date(conversation.mutedUntil) > new Date() : false);

  const setPreference = async (patch: Record<string, unknown>) => {
    await api.patch(`/conversations/${conversation.id}/preferences`, patch).catch(() => undefined);
    await fetchConversations();
  };

  const subtitle = (() => {
    if (typing.length > 0) {
      return typing.length === 1
        ? `${typing[0].displayName} is typing…`
        : `${typing.length} people are typing…`;
    }
    if (isDirect && counterpart) {
      if (counterpart.isConnected) return counterpart.statusText || statusLabel(counterpart.status);
      return counterpart.lastSeenAt ? `Last seen ${timeAgo(counterpart.lastSeenAt)}` : 'Offline';
    }
    const online = conversation.members.filter((m) => m.user.isConnected).length;
    const people = `${conversation.memberCount} ${conversation.memberCount === 1 ? 'person' : 'people'}`;
    return online > 0 ? `${people} · ${online} online now` : people;
  })();

  return (
    <header className="z-20 flex h-[64px] shrink-0 items-center gap-3 border-b border-line-soft bg-surface px-3 pl-14 sm:px-6 md:pl-6">
      <button
        onClick={() => setPanel('about')}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 pr-2 text-left transition-colors hover:bg-sunken"
        title="Open chat details"
      >
        {isDirect && counterpart ? (
          <Avatar
            name={counterpart.displayName}
            src={counterpart.avatarUrl}
            accent={counterpart.accentColor}
            size="md"
            online={counterpart.isConnected}
            status={counterpart.isConnected ? counterpart.status : 'offline'}
          />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            {conversation.kind === 'group' ? (
              <Users size={17} />
            ) : conversation.type === 'voice' ? (
              <Volume2 size={17} />
            ) : conversation.type === 'announcement' ? (
              <Megaphone size={17} />
            ) : conversation.isPrivate ? (
              <Lock size={17} />
            ) : (
              <Hash size={17} />
            )}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[16px] font-semibold leading-tight text-ink">
              {conversation.name}
            </span>
            {conversation.isPrivate && !isDirect && (
              <span
                title="Private — only invited people can read this"
                className="flex shrink-0 items-center gap-1 rounded-full bg-sunken px-1.5 py-0.5 text-2xs font-medium text-ink-faint"
              >
                <Lock size={9} /> Private
              </span>
            )}
            {conversation.type === 'announcement' && (
              <span className="shrink-0 rounded-full bg-saffron/15 px-1.5 py-0.5 text-2xs font-semibold text-saffron">
                Admins post only
              </span>
            )}
          </span>
          <AnimatePresence mode="wait">
            <motion.span
              key={subtitle}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 3 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'block truncate text-[12px]',
                typing.length > 0 ? 'italic text-brand' : 'text-ink-faint'
              )}
            >
              {subtitle}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        <Tooltip label={conversation.isFavorite ? 'Remove star' : 'Star this chat'}>
          <button
            onClick={() => void setPreference({ isFavorite: !conversation.isFavorite })}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-sunken',
              conversation.isFavorite ? 'text-gold' : 'text-ink-faint hover:text-ink'
            )}
            aria-label="Star this chat"
          >
            <Star size={17} className={conversation.isFavorite ? 'fill-current' : undefined} />
          </button>
        </Tooltip>

        <div className="relative">
          <Tooltip label={muted ? 'Notifications are off' : 'Mute notifications'}>
            <button
              onClick={() => {
                if (muted) void setPreference({ notifyLevel: 'all', mutedUntil: null });
                else setMuteMenu((v) => !v);
              }}
              className={cn(
                'grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-sunken',
                muted ? 'text-brand' : 'text-ink-faint hover:text-ink'
              )}
              aria-label="Mute notifications"
            >
              {muted ? <BellOff size={17} /> : <Bell size={17} />}
            </button>
          </Tooltip>

          <AnimatePresence>
            {muteMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMuteMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={spring}
                  className="absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop"
                >
                  <p className="px-3 py-1.5 eyebrow">Mute this chat</p>
                  {MUTE_OPTIONS.map((option) => (
                    <button
                      key={option.label}
                      onClick={() => {
                        void setPreference(
                          option.hours === null
                            ? { notifyLevel: 'none', mutedUntil: null }
                            : {
                                notifyLevel: 'all',
                                mutedUntil: new Date(
                                  Date.now() + option.hours * 3600_000
                                ).toISOString()
                              }
                        );
                        setMuteMenu(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
                    >
                      {option.label}
                    </button>
                  ))}
                  <div className="my-1 h-px bg-line" />
                  <button
                    onClick={() => {
                      void setPreference({ notifyLevel: 'mentions', mutedUntil: null });
                      setMuteMenu(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
                  >
                    {conversation.notifyLevel === 'mentions' && (
                      <Check size={13} className="text-brand" />
                    )}
                    Only when I'm mentioned
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <Tooltip label="Search in this chat">
          <button
            onClick={() => setPanel('search')}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-lg transition-colors',
              panel === 'search'
                ? 'bg-brand-soft text-brand'
                : 'text-ink-faint hover:bg-sunken hover:text-ink'
            )}
            aria-label="Search in this chat"
          >
            <Search size={17} />
          </button>
        </Tooltip>

        <Tooltip label={panel === 'none' ? 'Show chat details' : 'Hide panel'}>
          <button
            onClick={() => togglePanel('about')}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-lg transition-colors',
              panel !== 'none'
                ? 'bg-brand-soft text-brand'
                : 'text-ink-faint hover:bg-sunken hover:text-ink'
            )}
            aria-label="Toggle details panel"
            aria-pressed={panel !== 'none'}
          >
            <PanelRight size={17} />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}

function statusLabel(status: string) {
  return (
    { online: 'Online', away: 'Away', busy: 'Do not disturb', offline: 'Offline' }[status] ??
    'Online'
  );
}
