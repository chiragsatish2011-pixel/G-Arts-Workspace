import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../../stores/chat';
import { useAuthStore } from '../../stores/auth';
import { Avatar } from '../ui';

export function TypingIndicator({ channelId }: { channelId: string }) {
  const typing = useChatStore((s) => s.typing[channelId] ?? []);
  const users = useChatStore((s) => s.users);
  const me = useAuthStore((s) => s.user);

  const others = typing.filter((t) => t.userId !== me?.id);

  const label =
    others.length === 1
      ? `${others[0].displayName} is typing`
      : others.length === 2
        ? `${others[0].displayName} and ${others[1].displayName} are typing`
        : `${others.length} people are typing`;

  return (
    <div className="h-7 shrink-0 px-4 sm:px-8">
      <div className="mx-auto w-full max-w-[760px]">
        <AnimatePresence>
          {others.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="flex items-center gap-2 pl-1"
            >
              <div className="flex -space-x-2">
                {others.slice(0, 3).map((entry) => {
                  const user = users.find((u) => u.id === entry.userId);
                  return (
                    <Avatar
                      key={entry.userId}
                      name={entry.displayName}
                      src={user?.avatarUrl}
                      accent={user?.accentColor}
                      size="xs"
                      className="ring-2 ring-surface rounded-full"
                    />
                  );
                })}
              </div>

              <span className="flex items-center gap-1 rounded-full bg-sunken px-2 py-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-ink-faint animate-typing-dot"
                    style={{ animationDelay: `${i * 160}ms` }}
                  />
                ))}
              </span>

              <span className="truncate text-[11.5px] italic text-ink-faint">{label}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
