import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@g-arts/chat-shared';
import { spring } from '../ui';

/**
 * A small curated picker. A full Unicode set would mean shipping a megabyte of
 * emoji metadata for a feature people use to send a thumbs-up.
 */
const GROUPS: Array<{ name: string; emoji: string[] }> = [
  {
    name: 'Reactions',
    emoji: ['👍', '🙏', '✅', '🎉', '👏', '💯', '👀', '💡', '⭐', '🚀', '📌', '❗', '❓', '🆗', '🔔', '🏆']
  },
  {
    name: 'Faces',
    emoji: ['😊', '😀', '😄', '🙂', '😉', '😇', '🤔', '😐', '😅', '😌', '😔', '😴', '🤝', '🙌', '💪', '🫶']
  },
  {
    name: 'School',
    emoji: ['📚', '📖', '✏️', '📝', '🎓', '🧮', '🔬', '🗓️', '⏰', '📢', '🏫', '🖊️', '📋', '📊', '🗂️', '🔖']
  },
  {
    name: 'Gurukul',
    emoji: ['🪔', '🕉️', '🧘', '🌺', '🌸', '🍃', '☀️', '🌙', '🔱', '📿', '🎋', '🌼', '🫱', '🌞', '🪷', '✨']
  },
  {
    name: 'Everyday',
    emoji: ['🍵', '🥗', '🍎', '🏏', '⚽', '🎨', '🎵', '📷', '🌧️', '🌈', '🚌', '🏠', '🗺️', '📍', '🎁', '🧹']
  }
];

export function EmojiPicker({
  onSelect,
  onClose
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [group, setGroup] = useState(0);
  const container = useRef<HTMLDivElement>(null);

  // Dismiss on an outside click or Escape — a picker that traps you is worse
  // than no picker.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const visible = GROUPS[group].emoji;

  return (
    <motion.div
      ref={container}
      initial={{ opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 4 }}
      transition={spring}
      className="absolute bottom-full right-0 z-40 mb-2 w-[288px] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
    >
      <div className="flex gap-1 border-b border-line p-1.5">
        {GROUPS.map((g, i) => (
          <button
            key={g.name}
            title={g.name}
            onClick={() => setGroup(i)}
            className={cn(
              'flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors',
              i === group
                ? 'bg-brand-soft text-brand'
                : 'text-ink-faint hover:bg-sunken hover:text-ink'
            )}
          >
            {g.emoji[0]}
          </button>
        ))}
      </div>

      <div className="grid max-h-[200px] grid-cols-8 gap-0.5 overflow-y-auto p-2 scroll-slim">
        {visible.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            onClick={() => onSelect(emoji)}
            className="grid h-8 place-items-center rounded-lg text-lg transition-transform hover:scale-125 hover:bg-sunken"
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="border-t border-line px-3 py-1.5 text-2xs text-ink-faint">
        {GROUPS[group].name}
      </div>
    </motion.div>
  );
}
