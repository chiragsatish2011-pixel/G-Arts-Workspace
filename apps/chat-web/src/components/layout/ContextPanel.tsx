import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pin,
  Search,
  X,
  Crown,
  MessageSquarePlus,
  Loader2,
  UserPlus,
  LogOut,
  Check,
  Info,
  Users,
  ArrowRight,
  Hash,
  Lock,
  Megaphone,
  Volume2
} from 'lucide-react';
import {
  cn,
  formatDate,
  formatTime,
  timeAgo,
  truncate,
  type Conversation,
  type Message
} from '@g-arts/chat-shared';
import { useChatStore } from '../../stores/chat';
import { useAuthStore } from '../../stores/auth';
import { useUIStore, type ContextPanel as PanelKey } from '../../stores/ui';
import { Avatar, Button, EmptyState, Spinner, spring } from '../ui';
import api, { errorMessage } from '../../lib/api';

/** Labelled tabs, so nothing depends on decoding an icon. */
const TABS: Array<{ key: Exclude<PanelKey, 'none'>; label: string; icon: React.ReactNode }> = [
  { key: 'about', label: 'About', icon: <Info size={14} /> },
  { key: 'people', label: 'People', icon: <Users size={14} /> },
  { key: 'pinned', label: 'Pinned', icon: <Pin size={14} /> },
  { key: 'search', label: 'Search', icon: <Search size={14} /> }
];

export function ContextPanel({ conversation }: { conversation: Conversation }) {
  const panel = useUIStore((s) => s.panel);
  const setPanel = useUIStore((s) => s.setPanel);
  const pinned = useChatStore((s) => s.pinned[conversation.id] ?? []);

  return (
    <AnimatePresence>
      {panel !== 'none' && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 336, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={spring}
          className="hidden shrink-0 overflow-hidden border-l border-line bg-canvas lg:block"
        >
          <div className="flex h-full w-[336px] flex-col">
            <div className="flex h-[68px] shrink-0 items-center justify-between border-b border-line-soft px-4">
              <h2 className="font-display text-[15px] font-semibold text-ink">Chat details</h2>
              <button
                onClick={() => setPanel('none')}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-sunken hover:text-ink"
                aria-label="Close panel"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex gap-1 border-b border-line-soft px-2 py-2">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setPanel(tab.key)}
                  className={cn(
                    'relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-1.5 text-[12px] font-medium transition-colors',
                    panel === tab.key ? 'text-brand' : 'text-ink-faint hover:text-ink-soft'
                  )}
                >
                  {panel === tab.key && (
                    <motion.span
                      layoutId="panel-tab"
                      transition={spring}
                      className="absolute inset-0 rounded-lg bg-brand-soft"
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    {tab.icon}
                    {tab.label}
                    {tab.key === 'pinned' && pinned.length > 0 && (
                      <span className="tabular text-[10px] opacity-70">{pinned.length}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>

            <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
              {panel === 'about' && <AboutPanel conversation={conversation} />}
              {panel === 'people' && <PeoplePanel conversation={conversation} />}
              {panel === 'pinned' && <PinnedPanel conversation={conversation} />}
              {panel === 'search' && <SearchPanel conversation={conversation} />}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

function AboutPanel({ conversation }: { conversation: Conversation }) {
  const me = useAuthStore((s) => s.user);
  const openDirect = useChatStore((s) => s.openDirect);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const notify = useUIStore((s) => s.notify);
  const counterpart = conversation.counterpart;
  const [leaving, setLeaving] = useState(false);

  const canLeave = conversation.kind !== 'dm' && conversation.isMember;

  const leave = async () => {
    if (!me) return;
    if (!window.confirm(`Leave ${conversation.name}? You can be added back later.`)) return;
    setLeaving(true);
    try {
      await api.delete(`/conversations/${conversation.id}/members/${me.id}`);
      notify(`You left ${conversation.name}`, 'success');
      await fetchConversations();
    } catch (err) {
      notify(errorMessage(err, 'Could not leave this chat'), 'error');
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-5 flex flex-col items-center text-center">
        {counterpart ? (
          <Avatar
            name={counterpart.displayName}
            src={counterpart.avatarUrl}
            accent={counterpart.accentColor}
            size="xl"
            online={counterpart.isConnected}
            status={counterpart.isConnected ? counterpart.status : 'offline'}
          />
        ) : (
          <span className="grid h-20 w-20 place-items-center rounded-2xl bg-brand-soft text-brand">
            {conversation.kind === 'group' ? (
              <Users size={30} />
            ) : conversation.type === 'announcement' ? (
              <Megaphone size={30} />
            ) : conversation.type === 'voice' ? (
              <Volume2 size={30} />
            ) : conversation.isPrivate ? (
              <Lock size={30} />
            ) : (
              <Hash size={30} />
            )}
          </span>
        )}
        <h3 className="mt-3 font-display text-lg font-semibold text-ink">{conversation.name}</h3>
        {counterpart ? (
          <p className="text-[12.5px] text-ink-faint">@{counterpart.username}</p>
        ) : (
          <p className="text-[12.5px] text-ink-faint">
            {conversation.memberCount} {conversation.memberCount === 1 ? 'person' : 'people'} ·{' '}
            {conversation.messageCount} {conversation.messageCount === 1 ? 'message' : 'messages'}
          </p>
        )}
        {counterpart?.title && <p className="mt-1 text-[12.5px] text-ink-soft">{counterpart.title}</p>}

        {counterpart && counterpart.id !== me?.id && (
          <Button
            variant="subtle"
            size="sm"
            className="mt-3"
            onClick={() => void openDirect(counterpart.id)}
          >
            <MessageSquarePlus size={14} /> Message {counterpart.displayName.split(' ')[0]}
          </Button>
        )}
      </div>

      {conversation.description && <Field label="What this chat is for" value={conversation.description} />}
      {conversation.topic && <Field label="Current topic" value={conversation.topic} />}
      {counterpart?.statusText && <Field label="Their status" value={counterpart.statusText} />}
      {counterpart && !counterpart.isConnected && counterpart.lastSeenAt && (
        <Field label="Last seen" value={timeAgo(counterpart.lastSeenAt)} />
      )}
      <Field label="Started" value={formatDate(conversation.createdAt)} />
      <Field
        label="Who can read this"
        value={
          conversation.kind === 'dm'
            ? 'Only the two of you'
            : conversation.isPrivate
              ? 'Only the people invited to it'
              : 'Everyone at the Gurukul'
        }
      />
      <Field
        label="Notifications"
        value={
          conversation.notifyLevel === 'none'
            ? 'Off'
            : conversation.notifyLevel === 'mentions'
              ? 'Only when you are mentioned'
              : conversation.mutedUntil && new Date(conversation.mutedUntil) > new Date()
                ? `Muted until ${formatTime(conversation.mutedUntil)}`
                : 'Every message'
        }
      />

      {canLeave && (
        <Button
          variant="ghost"
          className="mt-3 w-full text-danger hover:bg-danger/10"
          onClick={() => void leave()}
          loading={leaving}
        >
          <LogOut size={15} /> Leave this chat
        </Button>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 border-b border-line-soft pb-3 last:border-0">
      <p className="mb-0.5 text-[11.5px] font-medium text-ink-faint">{label}</p>
      <p className="text-[13.5px] leading-relaxed text-ink">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

function PeoplePanel({ conversation }: { conversation: Conversation }) {
  const me = useAuthStore((s) => s.user);
  const openDirect = useChatStore((s) => s.openDirect);
  const allUsers = useChatStore((s) => s.users);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const notify = useUIStore((s) => s.notify);

  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const canManage =
    conversation.kind !== 'dm' &&
    (me?.role === 'admin' || conversation.myRole === 'owner' || conversation.myRole === 'admin');

  const memberIds = useMemo(
    () => new Set(conversation.members.map((m) => m.userId)),
    [conversation.members]
  );

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allUsers
      .filter((u) => !memberIds.has(u.id))
      .filter((u) => !needle || u.displayName.toLowerCase().includes(needle));
  }, [allUsers, memberIds, query]);

  const sorted = [...conversation.members].sort((a, b) => {
    if (a.user.isConnected !== b.user.isConnected) return a.user.isConnected ? -1 : 1;
    return a.user.displayName.localeCompare(b.user.displayName);
  });

  const add = async (userId: string) => {
    setBusy(true);
    try {
      await api.post(`/conversations/${conversation.id}/members`, { userIds: [userId] });
      await fetchConversations();
      notify('Added to the chat', 'success');
    } catch (err) {
      notify(errorMessage(err, 'Could not add them'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (userId: string, name: string) => {
    if (!window.confirm(`Remove ${name} from ${conversation.name}?`)) return;
    try {
      await api.delete(`/conversations/${conversation.id}/members/${userId}`);
      await fetchConversations();
      notify(`${name} was removed`, 'success');
    } catch (err) {
      notify(errorMessage(err, 'Could not remove them'), 'error');
    }
  };

  return (
    <div className="p-2">
      {canManage && (
        <div className="px-1 pb-2">
          <Button
            variant={adding ? 'subtle' : 'outline'}
            size="sm"
            className="w-full"
            onClick={() => setAdding((v) => !v)}
          >
            <UserPlus size={14} /> {adding ? 'Done adding' : 'Add people to this chat'}
          </Button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {adding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden px-1 pb-3"
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search members"
              className="mb-1.5 h-9 w-full rounded-xl border border-line bg-sunken px-3 text-[13px] focus:border-brand focus:bg-surface focus:outline-none"
            />
            {candidates.length === 0 ? (
              <p className="py-3 text-center text-[12.5px] text-ink-faint">
                Everyone is already here.
              </p>
            ) : (
              candidates.slice(0, 8).map((user) => (
                <button
                  key={user.id}
                  disabled={busy}
                  onClick={() => void add(user.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sunken disabled:opacity-50"
                >
                  <Avatar name={user.displayName} src={user.avatarUrl} accent={user.accentColor} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {user.displayName}
                  </span>
                  <UserPlus size={14} className="shrink-0 text-brand" />
                </button>
              ))
            )}
            <div className="mt-2 h-px bg-line" />
          </motion.div>
        )}
      </AnimatePresence>

      <p className="eyebrow px-3 pb-1">In this chat · {sorted.length}</p>

      {sorted.map((member) => (
        <div
          key={member.userId}
          className="group flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-sunken"
        >
          <Avatar
            name={member.user.displayName}
            src={member.user.avatarUrl}
            accent={member.user.accentColor}
            size="md"
            online={member.user.isConnected}
            status={member.user.isConnected ? member.user.status : 'offline'}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13.5px] font-medium text-ink">
                {member.user.displayName}
                {member.userId === me?.id && (
                  <span className="ml-1 text-[11px] text-ink-faint">(you)</span>
                )}
              </span>
              {(member.role === 'owner' || member.user.role === 'admin') && (
                <Crown size={11} className="shrink-0 text-gold" />
              )}
            </div>
            <p className="truncate text-[11.5px] text-ink-faint">
              {member.user.statusText ||
                member.user.title ||
                (member.user.isConnected
                  ? 'Online now'
                  : member.user.lastSeenAt
                    ? `Last seen ${timeAgo(member.user.lastSeenAt)}`
                    : 'Offline')}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            {member.userId !== me?.id && (
              <button
                onClick={() => void openDirect(member.userId)}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-line-soft hover:text-brand"
                title={`Message ${member.user.displayName}`}
              >
                <MessageSquarePlus size={15} />
              </button>
            )}
            {canManage && member.userId !== me?.id && (
              <button
                onClick={() => void remove(member.userId, member.user.displayName)}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"
                title={`Remove ${member.user.displayName}`}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pinned
// ---------------------------------------------------------------------------

function PinnedPanel({ conversation }: { conversation: Conversation }) {
  const pinned = useChatStore((s) => s.pinned[conversation.id] ?? []);
  const togglePin = useChatStore((s) => s.togglePin);
  const jumpToMessage = useUIStore((s) => s.jumpToMessage);

  if (pinned.length === 0) {
    return (
      <div className="pt-12">
        <EmptyState
          icon={<Pin size={22} />}
          title="Nothing pinned yet"
          body="Pin the decisions, briefs and links that matter, so nobody has to scroll to find them."
        />
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      {pinned.map((message) => (
        <div key={message.id} className="group rounded-xl border border-line bg-sunken p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <Avatar
              name={message.user?.displayName ?? '?'}
              src={message.user?.avatarUrl}
              accent={message.user?.accentColor}
              size="xs"
            />
            <span className="text-[12.5px] font-medium text-ink">{message.user?.displayName}</span>
            <span className="ml-auto text-2xs text-ink-faint">{formatDate(message.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-soft">
            {truncate(message.content, 240)}
          </p>
          <div className="mt-2 flex items-center gap-3 text-2xs font-medium opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => jumpToMessage(conversation.id, message.id)}
              className="flex items-center gap-1 text-brand hover:underline"
            >
              Go to message <ArrowRight size={11} />
            </button>
            <button
              onClick={() => void togglePin(message.id, false)}
              className="text-ink-faint hover:text-danger"
            >
              Unpin
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function SearchPanel({ conversation }: { conversation: Conversation }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);
  const [everywhere, setEverywhere] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    // Debounced, so typing does not fire a request per character.
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: term });
        if (!everywhere) params.set('channelId', conversation.id);
        const { data } = await api.get(`/conversations/search?${params}`);
        setResults(data.messages);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [query, everywhere, conversation.id]);

  return (
    <div className="p-3">
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a message"
          className="h-10 w-full rounded-xl border border-line bg-sunken pl-8 pr-3 text-[13px] focus:border-brand focus:bg-surface focus:outline-none"
        />
      </div>

      <label className="mb-3 flex cursor-pointer items-center gap-2 px-1 text-[12.5px] text-ink-soft">
        <span
          onClick={() => setEverywhere((v) => !v)}
          className={cn(
            'grid h-4 w-4 place-items-center rounded border transition-colors',
            everywhere ? 'border-brand bg-brand text-white' : 'border-line'
          )}
        >
          {everywhere && <Check size={11} strokeWidth={3} />}
        </span>
        <span onClick={() => setEverywhere((v) => !v)}>Search every chat, not just this one</span>
      </label>

      {searching && (
        <div className="flex justify-center py-6 text-ink-faint">
          <Loader2 size={18} className="animate-spin" />
        </div>
      )}

      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p className="py-8 text-center text-[13px] text-ink-faint">
          No messages match “{truncate(query, 24)}”.
        </p>
      )}

      {!searching && results.length > 0 && (
        <p className="eyebrow mb-2 px-1">
          {results.length} {results.length === 1 ? 'match' : 'matches'}
        </p>
      )}

      <div className="space-y-2">
        {results.map((message) => (
          <SearchHit key={message.id} message={message} query={query} />
        ))}
      </div>
    </div>
  );
}

function SearchHit({
  message,
  query
}: {
  message: Message & { channel?: { id: string; name: string } };
  query: string;
}) {
  const openConversation = useChatStore((s) => s.openConversation);
  const jumpToMessage = useUIStore((s) => s.jumpToMessage);

  // Highlight matched terms by splitting the string — message text is never
  // turned into markup.
  const terms = query.trim().split(/\s+/).filter((t) => t.length >= 2);
  const pattern = terms.length
    ? new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    : null;
  const parts = pattern ? message.content.split(pattern) : [message.content];

  return (
    <button
      onClick={async () => {
        await openConversation(message.channelId);
        jumpToMessage(message.channelId, message.id);
      }}
      className="block w-full rounded-xl border border-line bg-sunken p-3 text-left transition-colors hover:border-brand/50"
    >
      <div className="mb-1 flex items-center gap-2">
        <Avatar name={message.user?.displayName ?? '?'} src={message.user?.avatarUrl} size="xs" />
        <span className="text-[12.5px] font-medium text-ink">{message.user?.displayName}</span>
        <span className="ml-auto text-2xs text-ink-faint">
          {formatDate(message.createdAt)} · {formatTime(message.createdAt)}
        </span>
      </div>
      {message.channel && (
        <span className="mb-1 inline-block rounded bg-brand-soft px-1.5 py-0.5 text-2xs font-medium text-brand">
          {message.channel.name}
        </span>
      )}
      <p className="line-clamp-3 text-[13px] leading-relaxed text-ink-soft">
        {parts.map((part, i) =>
          pattern && terms.some((t) => t.toLowerCase() === part.toLowerCase()) ? (
            <mark key={i} className="rounded bg-gold/25 px-0.5 text-ink">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </p>
    </button>
  );
}
