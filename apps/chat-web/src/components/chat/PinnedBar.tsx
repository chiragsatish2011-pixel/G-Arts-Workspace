import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pin, ChevronRight, X } from 'lucide-react';
import { truncate, type Conversation } from '@g-arts/chat-shared';
import { useChatStore } from '../../stores/chat';
import { useUIStore } from '../../stores/ui';
import { spring } from '../ui';

/**
 * A single-line reminder of what has been pinned, directly above the messages.
 * Pins are usually the brief or the decision — burying them in a side panel
 * means nobody reads them.
 */
export function PinnedBar({ conversation }: { conversation: Conversation }) {
  const pinned = useChatStore((s) => s.pinned[conversation.id] ?? []);
  const jumpToMessage = useUIStore((s) => s.jumpToMessage);
  const setPanel = useUIStore((s) => s.setPanel);
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Rotate through pins one at a time rather than stacking a wall of them.
  const [index, setIndex] = useState(0);
  const current = pinned[index % Math.max(pinned.length, 1)];

  const hidden = pinned.length === 0 || dismissed === conversation.id;

  return (
    <AnimatePresence initial={false}>
      {!hidden && current && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={spring}
          className="shrink-0 overflow-hidden border-b border-line-soft bg-surface"
        >
          <div className="flex items-center gap-2.5 px-4 py-2 sm:px-6">
            <Pin size={13} className="shrink-0 text-saffron" />

            <button
              onClick={() => jumpToMessage(conversation.id, current.id)}
              className="min-w-0 flex-1 text-left"
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={current.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className="block truncate text-[12.5px] text-ink-soft"
                >
                  <span className="font-medium text-ink">
                    {current.user?.displayName?.split(' ')[0]}:
                  </span>{' '}
                  {truncate(current.content.replace(/\n/g, ' ') || 'Attachment', 90)}
                </motion.span>
              </AnimatePresence>
            </button>

            {pinned.length > 1 && (
              <button
                onClick={() => setIndex((i) => (i + 1) % pinned.length)}
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium text-ink-faint transition-colors hover:bg-sunken hover:text-ink"
                title="Next pinned message"
              >
                {(index % pinned.length) + 1}/{pinned.length}
                <ChevronRight size={11} />
              </button>
            )}

            <button
              onClick={() => setPanel('pinned')}
              className="hidden shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-medium text-saffron transition-colors hover:bg-saffron/10 sm:block"
            >
              See all
            </button>

            <button
              onClick={() => setDismissed(conversation.id)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-faint transition-colors hover:bg-sunken hover:text-ink"
              aria-label="Hide pinned bar"
            >
              <X size={12} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
