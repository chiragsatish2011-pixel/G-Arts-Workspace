import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessagesSquare, Command } from 'lucide-react';
import { useChatStore } from '../stores/chat';
import { useAuthStore } from '../stores/auth';
import { useUIStore } from '../stores/ui';
import { AppShell } from '../components/layout/AppShell';
import { ContextPanel } from '../components/layout/ContextPanel';
import { ChatHeader } from '../components/chat/ChatHeader';
import { MessageList } from '../components/chat/MessageList';
import { PinnedBar } from '../components/chat/PinnedBar';
import { Composer } from '../components/chat/Composer';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { EmptyState, Spinner, Button } from '../components/ui';
import { useNotifications } from '../lib/notifications';

export function ChatPage() {
  const user = useAuthStore((s) => s.user);
  const {
    bootstrap,
    attachSocket,
    conversations,
    activeId,
    openConversation,
    initialised,
    error,
    clearError
  } = useChatStore();
  const setPalette = useUIStore((s) => s.setPalette);

  useNotifications();

  useEffect(() => {
    void bootstrap();
    return attachSocket();
    // Run once per mounted session — the socket handlers read live state via get().
  }, []);

  // Land in a sensible room rather than an empty screen on first load.
  useEffect(() => {
    if (!initialised || activeId || conversations.length === 0) return;
    const general = conversations.find((c) => c.slug === 'general') ?? conversations[0];
    void openConversation(general.id);
  }, [initialised, activeId, conversations, openConversation]);

  const active = conversations.find((c) => c.id === activeId);

  const canPost =
    active &&
    !active.isArchived &&
    (active.type !== 'announcement' || user?.role === 'admin');

  return (
    <AppShell>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {!initialised ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : !active ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={<MessagesSquare size={24} />}
                title="Pick up where you left off"
                body="Choose a chat on the left, or press ⌘K to jump straight to anyone."
                action={
                  <Button variant="subtle" onClick={() => setPalette(true)}>
                    <Command size={14} /> Jump to a chat
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <ChatHeader conversation={active} />
              <PinnedBar conversation={active} />
              <MessageList channelId={active.id} />
              <TypingIndicator channelId={active.id} />
              <Composer
                channelId={active.id}
                disabled={!canPost}
                placeholder={
                  !canPost
                    ? active.isArchived
                      ? 'This conversation is archived'
                      : 'Only admins can post here'
                    : active.kind === 'dm'
                      ? `Message ${active.counterpart?.displayName ?? ''}`
                      : `Message ${active.name}`
                }
              />
            </>
          )}
        </div>

        {active && <ContextPanel conversation={active} />}
      </div>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
          >
            <button
              onClick={clearError}
              className="flex items-center gap-3 rounded-xl border border-danger/40 bg-surface px-4 py-2.5 text-[13px] text-ink shadow-pop"
            >
              <span className="h-2 w-2 rounded-full bg-danger" />
              {error}
              <span className="text-ink-faint">Dismiss</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
