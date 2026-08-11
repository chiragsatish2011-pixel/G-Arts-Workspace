import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, type Conversation } from '@g-arts/chat-shared';
import { useAuthStore } from '../../stores/auth';
import { Avatar, Tooltip, spring } from '../ui';

/**
 * A row of small faces under your most recent message showing who has actually
 * read it. Derived from the same per-member read cursors that drive the ticks,
 * so it costs nothing extra to display.
 *
 * Only shown on your own last message, and only in a conversation with more
 * than two people — in a 1:1 the second tick already says everything.
 */
export function SeenBy({
  conversation,
  messageCreatedAt
}: {
  conversation: Conversation;
  messageCreatedAt: string;
}) {
  const me = useAuthStore((s) => s.user);

  const readers = useMemo(() => {
    if (!me) return [];
    const sentAt = new Date(messageCreatedAt).getTime();
    return conversation.members
      .filter((m) => m.userId !== me.id)
      .filter((m) => m.lastReadAt && new Date(m.lastReadAt).getTime() >= sentAt)
      .map((m) => m.user);
  }, [conversation.members, messageCreatedAt, me]);

  if (conversation.memberCount <= 2 || readers.length === 0) return null;

  const shown = readers.slice(0, 6);
  const extra = readers.length - shown.length;

  return (
    <div className="mt-1 flex items-center justify-end gap-1.5 pr-1">
      <span className="text-[10.5px] text-ink-faint">Seen by</span>
      <div className="flex -space-x-1.5">
        <AnimatePresence initial={false}>
          {shown.map((reader) => (
            <motion.span
              key={reader.id}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={spring}
            >
              <Tooltip label={reader.displayName}>
                <Avatar
                  name={reader.displayName}
                  src={reader.avatarUrl}
                  accent={reader.accentColor}
                  size="xs"
                  className={cn('rounded-full ring-2 ring-surface')}
                />
              </Tooltip>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      {extra > 0 && <span className="text-[10.5px] tabular text-ink-faint">+{extra}</span>}
    </div>
  );
}
