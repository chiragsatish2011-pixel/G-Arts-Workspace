import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { AtSign, Users } from 'lucide-react';
import { cn, type Conversation, type User } from '@g-arts/chat-shared';
import { Avatar, spring } from '../ui';

export interface MentionQuery {
  /** Text between the `@` and the caret. */
  term: string;
  /** Index of the `@` in the textarea value. */
  start: number;
}

/**
 * Finds an in-progress `@mention` at the caret, so the picker only appears
 * while someone is actually addressing a person — not every time an `@`
 * exists somewhere in the draft.
 */
export function findMentionQuery(value: string, caret: number): MentionQuery | null {
  const before = value.slice(0, caret);
  const match = /(?:^|\s)@([a-z0-9._-]*)$/i.exec(before);
  if (!match) return null;
  return { term: match[1], start: caret - match[1].length - 1 };
}

interface Props {
  options: User[];
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (handle: string) => void;
}

const EVERYONE = {
  id: '__everyone__',
  username: 'everyone',
  displayName: 'Everyone',
  title: 'Notify every member of this chat'
} as const;

/**
 * Builds the candidate list. Kept as a hook so the composer — which owns the
 * keyboard — can read the same options the picker renders, without a second
 * window-level key listener racing React's own event handling.
 */
export function useMentionOptions(
  conversation: Conversation | undefined,
  query: MentionQuery | null
): User[] {
  return useMemo(() => {
    if (!conversation || !query) return [];
    const term = query.term.toLowerCase();
    const people = conversation.members
      .map((m) => m.user)
      .filter(
        (u) =>
          !term ||
          u.username.toLowerCase().includes(term) ||
          u.displayName.toLowerCase().includes(term)
      )
      .sort((a, b) => {
        // Exact prefix matches first, then everyone else alphabetically.
        const aStarts = a.username.toLowerCase().startsWith(term) ? 0 : 1;
        const bStarts = b.username.toLowerCase().startsWith(term) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.displayName.localeCompare(b.displayName);
      })
      .slice(0, 6);

    const includeEveryone = 'everyone'.startsWith(term) && conversation.memberCount > 2;
    return includeEveryone ? [EVERYONE as unknown as User, ...people] : people;
  }, [conversation, query]);
}

export function MentionPicker({ options, activeIndex, onHover, onPick }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-i="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (options.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4 }}
      transition={spring}
      className="absolute bottom-full left-0 z-40 mb-2 w-[300px] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
    >
      <div className="flex items-center gap-1.5 border-b border-line-soft px-3 py-2">
        <AtSign size={12} className="text-brand" />
        <span className="eyebrow">Mention someone</span>
      </div>

      <div ref={listRef} className="scroll-slim max-h-[232px] overflow-y-auto p-1">
        {options.map((option, index) => (
          <button
            key={option.id}
            data-i={index}
            onMouseEnter={() => onHover(index)}
            onClick={() => onPick(option.username)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors',
              index === activeIndex ? 'bg-brand-soft' : 'hover:bg-sunken'
            )}
          >
            {option.id === '__everyone__' ? (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-saffron/15 text-saffron">
                <Users size={15} />
              </span>
            ) : (
              <Avatar
                name={option.displayName}
                src={option.avatarUrl}
                accent={option.accentColor}
                size="sm"
                online={option.isConnected}
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">
                {option.displayName}
              </span>
              <span className="block truncate text-[11.5px] text-ink-faint">
                {option.id === '__everyone__' ? EVERYONE.title : `@${option.username}`}
              </span>
            </span>
          </button>
        ))}
      </div>

      <p className="border-t border-line-soft px-3 py-1.5 text-2xs text-ink-faint">
        ↑ ↓ to choose · Enter to insert · Esc to dismiss
      </p>
    </motion.div>
  );
}
