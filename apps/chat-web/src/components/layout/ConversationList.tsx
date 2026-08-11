import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Hash,
  Lock,
  Megaphone,
  Volume2,
  Search,
  Plus,
  Star,
  Users,
  ChevronRight,
  BellOff,
  X
} from 'lucide-react';
import { cn, formatListTime, truncate, type Conversation } from '@g-arts/chat-shared';
import { useChatStore } from '../../stores/chat';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { Avatar, Badge, Tooltip, spring } from '../ui';

export function ConversationList({ onNewConversation }: { onNewConversation: () => void }) {
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const openConversation = useChatStore((s) => s.openConversation);
  const typing = useChatStore((s) => s.typing);
  const me = useAuthStore((s) => s.user);
  const setSidebar = useUIStore((s) => s.setSidebar);

  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (needle && !c.name.toLowerCase().includes(needle)) return false;
      if (unreadOnly && c.unreadCount === 0 && c.mentionCount === 0) return false;
      return true;
    });
  }, [conversations, query, unreadOnly]);

  /**
   * Three plainly-named sections rather than a row of filter tabs. Everything
   * stays visible at once, so nothing is hidden behind a control the reader has
   * to think about first.
   */
  const groups = useMemo(
    () => [
      {
        key: 'starred',
        title: 'Starred',
        hint: 'Chats you marked with a star',
        items: visible.filter((c) => c.isFavorite)
      },
      {
        key: 'people',
        title: 'People',
        hint: 'One-to-one and small group chats',
        items: visible.filter((c) => !c.isFavorite && (c.kind === 'dm' || c.kind === 'group'))
      },
      {
        key: 'channels',
        title: 'Channels',
        hint: 'Shared channels for everyone',
        items: visible.filter((c) => !c.isFavorite && c.kind === 'channel')
      }
    ],
    [visible]
  );

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-3">
        {/*
          Starting a private chat. The modal and the whole `dm` path already
          existed, but nothing ever called `onNewConversation`, so there was no
          way in from the sidebar — the only people you could message were the
          ones who had messaged you first.
        */}
        {/*
          `text-canvas`, not `text-white`. The sidebar carries `.panel-dark`,
          which redefines --c-brand to white so accents read against maroon —
          so `bg-brand text-white` rendered white on white. Against the same
          token, canvas is the maroon behind the panel, which gives a white
          pill with a maroon label.
        */}
        <button
          onClick={onNewConversation}
          className="mb-2.5 flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 text-[13px] font-semibold text-canvas transition-opacity hover:opacity-90"
        >
          <Plus size={15} />
          New chat
        </button>

        <div className="relative mb-2.5">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people and channels"
            className="h-9 w-full rounded-xl border border-line bg-sunken pl-8 pr-8 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand focus:bg-surface focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-ink-faint hover:text-ink"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* One switch instead of four tabs: everything, or only what needs you. */}
        <button
          onClick={() => setUnreadOnly((v) => !v)}
          className={cn(
            'mb-1 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px] transition-colors',
            unreadOnly
              ? 'border-brand/40 bg-brand-soft text-brand'
              : 'border-transparent bg-sunken/60 text-ink-soft hover:bg-sunken'
          )}
        >
          <span
            className={cn(
              'h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors',
              unreadOnly ? 'bg-brand' : 'bg-line'
            )}
          >
            <motion.span
              animate={{ x: unreadOnly ? 12 : 0 }}
              transition={spring}
              className="block h-3 w-3 rounded-full bg-white shadow-sm"
            />
          </span>
          Show only unread
          {totalUnread > 0 && (
            <span className="ml-auto tabular text-[11px] font-semibold">{totalUnread} waiting</span>
          )}
        </button>
      </div>

      <div className="scroll-slim flex-1 overflow-y-auto px-2 pb-3">
        {visible.length === 0 && (
          <p className="px-4 py-10 text-center text-[13px] leading-relaxed text-ink-faint">
            {query
              ? `Nothing matches “${truncate(query, 20)}”.`
              : unreadOnly
                ? 'You are all caught up.'
                : 'No chats yet — press + to start one.'}
          </p>
        )}

        {groups.map((group) =>
          group.items.length === 0 ? null : (
            <Section
              key={group.key}
              title={group.title}
              hint={group.hint}
              count={group.items.reduce((sum, c) => sum + c.unreadCount, 0)}
              starred={group.key === 'starred'}
            >
              {group.items.map((c) => (
                <Row
                  key={c.id}
                  conversation={c}
                  active={c.id === activeId}
                  typingNames={(typing[c.id] ?? [])
                    .filter((t) => t.userId !== me?.id)
                    .map((t) => t.displayName)}
                  onClick={() => {
                    void openConversation(c.id);
                    setSidebar(false);
                  }}
                />
              ))}
            </Section>
          )
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  count,
  starred,
  children
}: {
  title: string;
  hint: string;
  count: number;
  starred?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        title={hint}
        className="group/sec flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-sunken"
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={spring}
          className="text-ink-faint"
        >
          <ChevronRight size={12} />
        </motion.span>
        {starred && <Star size={11} className="fill-current text-gold" />}
        <span className="eyebrow group-hover/sec:text-ink-soft">{title}</span>
        {!open && count > 0 && (
          <span className="ml-auto">
            <Badge count={count} accent />
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-0.5 overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChannelIcon({ conversation }: { conversation: Conversation }) {
  if (conversation.type === 'voice') return <Volume2 size={15} />;
  if (conversation.type === 'announcement') return <Megaphone size={15} />;
  if (conversation.isPrivate) return <Lock size={15} />;
  return <Hash size={15} />;
}

function Row({
  conversation,
  active,
  typingNames,
  onClick
}: {
  conversation: Conversation;
  active: boolean;
  typingNames: string[];
  onClick: () => void;
}) {
  const me = useAuthStore((s) => s.user);
  const isDirect = conversation.kind === 'dm';
  const unread = conversation.unreadCount;
  const muted = conversation.notifyLevel === 'none' || Boolean(conversation.mutedUntil);

  const preview = (() => {
    if (typingNames.length > 0) {
      return typingNames.length === 1
        ? `${typingNames[0]} is typing…`
        : `${typingNames.length} people are typing…`;
    }
    const last = conversation.lastMessage;
    if (!last) return conversation.description ?? 'No messages yet';

    const authorPrefix =
      last.userId === me?.id ? 'You: ' : isDirect ? '' : `${last.user.displayName.split(' ')[0]}: `;

    if (!last.content && last.attachments.length > 0) {
      return `${authorPrefix}📎 ${last.attachments[0].fileName}`;
    }
    return authorPrefix + truncate(last.content.replace(/\n/g, ' '), 48);
  })();

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left',
        'transition-[background-color,transform,box-shadow] duration-150 ease-spring',
        'hover:-translate-y-px active:translate-y-0',
        active ? 'bg-surface shadow-card' : 'hover:bg-sunken hover:shadow-card'
      )}
    >
      {active && (
        <motion.span
          layoutId="active-conversation"
          transition={spring}
          className="absolute -left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-brand"
        />
      )}

      {isDirect && conversation.counterpart ? (
        <Avatar
          name={conversation.counterpart.displayName}
          src={conversation.counterpart.avatarUrl}
          accent={conversation.counterpart.accentColor}
          size="md"
          online={conversation.counterpart.isConnected}
          status={
            conversation.counterpart.isConnected ? conversation.counterpart.status : 'offline'
          }
        />
      ) : conversation.kind === 'group' ? (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-saffron/12 text-saffron">
          <Users size={17} />
        </span>
      ) : (
        <span
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors',
            active
              ? 'bg-brand-soft text-brand'
              : 'bg-sunken/70 text-ink-faint group-hover:text-ink-soft'
          )}
        >
          <ChannelIcon conversation={conversation} />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'truncate text-[13.5px]',
              unread > 0 ? 'font-semibold text-ink' : 'font-medium text-ink-soft'
            )}
          >
            {conversation.name}
          </span>
          {muted && <BellOff size={11} className="shrink-0 self-center text-ink-faint" />}
          {conversation.lastMessageAt && (
            <span className="ml-auto shrink-0 text-[10.5px] tabular text-ink-faint">
              {formatListTime(conversation.lastMessageAt)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'mt-0.5 truncate text-[12px]',
              typingNames.length > 0
                ? 'italic text-brand'
                : unread > 0
                  ? 'text-ink-soft'
                  : 'text-ink-faint'
            )}
          >
            {preview}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {conversation.mentionCount > 0 && (
              <span
                title="You were mentioned"
                className="grid h-[18px] w-[18px] place-items-center rounded-full bg-brand text-[10px] font-bold text-white"
              >
                @
              </span>
            )}
            {unread > 0 && <Badge count={unread} accent={!muted} />}
          </span>
        </span>
      </span>
    </button>
  );
}
