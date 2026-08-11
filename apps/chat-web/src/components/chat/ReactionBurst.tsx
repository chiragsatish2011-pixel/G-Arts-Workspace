import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * A short burst when you add a reaction: the emoji swells and a few sparks
 * scatter. It exists to make a deliberate action feel answered — not to
 * manufacture a reason to keep tapping. `DO_NOT_BUILD.md` rules out streaks,
 * scores and popularity counts, so nothing here rewards volume.
 */
export function ReactionBurst({ emoji, onDone }: { emoji: string; onDone: () => void }) {
  const [sparks] = useState(() =>
    Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
      const distance = 16 + Math.random() * 10;
      return {
        id: i,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance
      };
    })
  );

  useEffect(() => {
    const timer = setTimeout(onDone, 520);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <span className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.4, 1], opacity: [0, 1, 0] }}
        transition={{ duration: 0.5, times: [0, 0.45, 1] }}
        className="text-[22px] leading-none"
      >
        {emoji}
      </motion.span>

      {sparks.map((spark) => (
        <motion.span
          key={spark.id}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
          animate={{ x: spark.dx, y: spark.dy, scale: 1, opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="absolute h-1 w-1 rounded-full bg-brand"
        />
      ))}
    </span>
  );
}

/** Tracks which message is currently bursting, so only one plays at a time. */
export function useReactionBurst() {
  const [burst, setBurst] = useState<{ messageId: string; emoji: string } | null>(null);

  return {
    burst,
    fire: (messageId: string, emoji: string) => setBurst({ messageId, emoji }),
    clear: () => setBurst(null),
    render: (messageId: string) =>
      burst?.messageId === messageId ? (
        <AnimatePresence>
          <ReactionBurst emoji={burst.emoji} onDone={() => setBurst(null)} />
        </AnimatePresence>
      ) : null
  };
}
