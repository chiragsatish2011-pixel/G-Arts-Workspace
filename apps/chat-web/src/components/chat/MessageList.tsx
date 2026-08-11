import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown, MessagesSquare } from 'lucide-react';
import { cn, formatDate } from '@g-arts/chat-shared';
import { useChatStore, isPending } from '../../stores/chat';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { MessageBubble } from './MessageBubble';
import { SeenBy } from './SeenBy';
import { Spinner, EmptyState, Badge, spring } from '../ui';

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function MessageList({ channelId }: { channelId: string }) {
  const messages = useChatStore((s) => s.messages[channelId]) ?? [];
  const loading = useChatStore((s) => s.loadingMessages[channelId]);
  const hasMore = useChatStore((s) => s.hasMore[channelId]);
  const loadOlder = useChatStore((s) => s.loadOlder);
  const markRead = useChatStore((s) => s.markRead);
  const users = useChatStore((s) => s.users);
  const conversation = useChatStore((s) => s.conversations.find((c) => c.id === channelId));
  const me = useAuthStore((s) => s.user);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const previousHeight = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [missed, setMissed] = useState(0);
  const pinnedCount = useChatStore((s) => (s.pinned[channelId] ?? []).length);
  const jumpTarget = useUIStore((s) => s.jumpTarget);
  const clearJumpTarget = useUIStore((s) => s.clearJumpTarget);

  const knownUsernames = useMemo(
    () => new Set(users.map((u) => u.username.toLowerCase())),
    [users]
  );

  /**
   * Where the "new messages" line sits. Frozen on entry so it does not race
   * upward as the read cursor advances while you are reading.
   */
  const [unreadAnchor] = useState(() => conversation?.lastReadAt ?? null);

  const firstUnreadId = useMemo(() => {
    if (!unreadAnchor || !me) return null;
    const anchor = new Date(unreadAnchor).getTime();
    const first = messages.find(
      (m) => m.userId !== me.id && new Date(m.createdAt).getTime() > anchor
    );
    return first?.id ?? null;
  }, [unreadAnchor, messages, me]);

  // Keep the viewport pinned to the newest message unless the reader has
  // scrolled up to look at history.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (pinnedToBottom.current) {
      el.scrollTop = el.scrollHeight;
      setMissed(0);
    } else if (previousHeight.current && el.scrollHeight > previousHeight.current) {
      // Older messages were prepended — hold the reader's place instead of
      // yanking them to a new offset.
      el.scrollTop += el.scrollHeight - previousHeight.current;
    }
    previousHeight.current = el.scrollHeight;
  }, [messages.length, channelId]);

  useEffect(() => {
    pinnedToBottom.current = true;
    previousHeight.current = 0;
    setShowJump(false);
    setMissed(0);
  }, [channelId]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 80;
    pinnedToBottom.current = atBottom;
    setShowJump(!atBottom);
    if (atBottom) setMissed(0);

    if (el.scrollTop < 240 && hasMore && !loading) {
      previousHeight.current = el.scrollHeight;
      void loadOlder(channelId);
    }
  }, [channelId, hasMore, loading, loadOlder]);

  // Count what arrived while scrolled away, so the jump pill can say how much.
  const lastCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > lastCount.current && !pinnedToBottom.current) {
      setMissed((n) => n + (messages.length - lastCount.current));
    }
    lastCount.current = messages.length;
  }, [messages.length]);

  const jumpToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    pinnedToBottom.current = true;
    setMissed(0);
    const last = [...messages].reverse().find((m) => !isPending(m));
    if (last) markRead(channelId, last.id);
  };

  const lastOwnMessageId = useMemo(() => {
    if (!me) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.userId === me.id && !isPending(m) && !m.deletedAt) return m.id;
    }
    return null;
  }, [messages, me]);

  const jumpTo = useCallback((messageId: string) => {
    const target = document.getElementById(`message-${messageId}`);
    if (!target) return false;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pinnedToBottom.current = false;
    target.classList.add('ring-2', 'ring-brand', 'ring-offset-2', 'ring-offset-canvas', 'rounded-2xl');
    setTimeout(
      () => target.classList.remove('ring-2', 'ring-brand', 'ring-offset-2', 'ring-offset-canvas', 'rounded-2xl'),
      1600
    );
    return true;
  }, []);

  // A pinned entry or a search result can ask to be shown. If the message is
  // not in the loaded window yet, keep pulling older pages until it is.
  useEffect(() => {
    if (!jumpTarget || jumpTarget.channelId !== channelId) return;
    if (jumpTo(jumpTarget.messageId)) {
      clearJumpTarget();
      return;
    }
    if (hasMore && !loading) {
      void loadOlder(channelId);
    } else {
      clearJumpTarget();
    }
  }, [jumpTarget, channelId, messages.length, hasMore, loading, jumpTo, clearJumpTarget, loadOlder]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-3 text-[13px] text-ink-soft">
          <Spinner size="sm" /> Loading the conversation…
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={<MessagesSquare size={24} />}
          title="Nothing here yet"
          body={
            conversation?.kind === 'dm'
              ? `Say hello to ${conversation.counterpart?.displayName ?? 'them'} — this thread is just the two of you.`
              : 'Be the first to post. Everything shared here stays within the Gurukul.'
          }
        />
      </div>
    );
  }

  let previousDate = '';

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-slim flex h-full flex-col justify-end overflow-y-auto px-4 py-4 sm:px-8"
      >
        {hasMore ? (
          <div className="flex justify-center pb-3">
            {loading ? (
              <Spinner size="sm" />
            ) : (
              <span className="eyebrow">Scroll up for earlier messages</span>
            )}
          </div>
        ) : (
          // Reaching the top is a real place, not just the end of a list.
          <div className="mx-auto mb-6 mt-1 max-w-[760px] px-3 text-center">
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.05 }}
              className="display-title mb-1"
            >
              {conversation?.kind === 'dm'
                ? conversation.counterpart?.displayName
                : conversation?.name}
            </motion.p>
            <p className="text-[12.5px] text-ink-faint">
              {conversation?.kind === 'dm'
                ? 'The beginning of your conversation.'
                : conversation?.description || 'The beginning of this channel.'}
            </p>

            {/* Figures in the site's own treatment: a red numeral, a quiet label. */}
            {conversation && conversation.kind !== 'dm' && (
              <motion.div
                initial="hidden"
                animate="shown"
                variants={{ shown: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } } }}
                className="mt-6 flex items-start justify-center gap-10"
              >
                {[
                  { figure: conversation.memberCount, label: conversation.memberCount === 1 ? 'Member' : 'Members' },
                  { figure: conversation.messageCount, label: conversation.messageCount === 1 ? 'Message' : 'Messages' },
                  { figure: pinnedCount, label: pinnedCount === 1 ? 'Pinned' : 'Pinned' }
                ].map((stat) => (
                  <motion.div
                    key={stat.label}
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      shown: { opacity: 1, y: 0, transition: spring }
                    }}
                  >
                    <span className="stat-figure block">{stat.figure}</span>
                    <span className="mt-1 block text-[11.5px] text-ink-faint">{stat.label}</span>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        )}

        <div className="mx-auto w-full max-w-[760px] shrink-0">
          {messages.map((message, index) => {
            const date = formatDate(message.createdAt);
            const showDate = date !== previousDate;
            previousDate = date;

            const previous = index > 0 ? messages[index - 1] : null;
            const next = index < messages.length - 1 ? messages[index + 1] : null;

            const sameAuthorAsPrevious =
              previous &&
              previous.userId === message.userId &&
              !previous.deletedAt &&
              !showDate &&
              new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
                GROUP_WINDOW_MS;

            const sameAuthorAsNext =
              next &&
              next.userId === message.userId &&
              new Date(next.createdAt).getTime() - new Date(message.createdAt).getTime() <
                GROUP_WINDOW_MS;

            return (
              <div key={message.id} id={`message-${message.id}`}>
                {showDate && (
                  <div className="flex items-center gap-3 py-4">
                    <span className="h-px flex-1 bg-line-soft" />
                    <span className="px-2 text-2xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
                      {date}
                    </span>
                    <span className="h-px flex-1 bg-line-soft" />
                  </div>
                )}

                {firstUnreadId === message.id && (
                  <motion.div
                    initial={{ opacity: 0, scaleX: 0.9 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    className="flex items-center gap-3 py-3"
                  >
                    <span className="h-px flex-1 bg-brand/50" />
                    <span className="rounded-full bg-brand px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-white">
                      New
                    </span>
                    <span className="h-px flex-1 bg-brand/50" />
                  </motion.div>
                )}

                <MessageBubble
                  message={message}
                  showHeader={!sameAuthorAsPrevious}
                  isLastOfGroup={!sameAuthorAsNext}
                  knownUsernames={knownUsernames}
                  onJumpTo={jumpTo}
                />

                {conversation && message.id === lastOwnMessageId && (
                  <SeenBy conversation={conversation} messageCreatedAt={message.createdAt} />
                )}
              </div>
            );
          })}
        </div>
        <div ref={bottomRef} className="h-2" />
      </div>

      <AnimatePresence>
        {showJump && (
          <motion.button
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.9 }}
            transition={spring}
            onClick={jumpToBottom}
            className={cn(
              'absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2',
              'rounded-full border border-line bg-surface px-3.5 py-2 shadow-float',
              'text-[13px] font-medium text-ink transition-colors hover:bg-sunken'
            )}
          >
            <ArrowDown size={14} />
            {missed > 0 ? (
              <>
                {missed} new message{missed > 1 ? 's' : ''}
                <Badge count={missed} accent />
              </>
            ) : (
              'Jump to latest'
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
