import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { WorkspaceHandoff } from './pages/WorkspaceHandoff';
import { ChatPage } from './pages/ChatPage';
import { useAuthStore } from './stores/auth';
import { useUIStore } from './stores/ui';
import { Spinner } from './components/ui';
import { Monogram } from './components/ui/Logo';
import { CommandPalette } from './components/overlays/CommandPalette';
import { Lightbox } from './components/overlays/Lightbox';
import { setSessionLostHandler } from './lib/api';
import { disconnectSocket } from './lib/socket';

function Protected({ children }: { children: ReactNode }) {
  const { user, isRestoring } = useAuthStore();

  if (isRestoring) {
    return (
      <div className="grid h-screen place-items-center bg-canvas">
        <div className="flex flex-col items-center gap-4">
          <Monogram size={56} />
          <Spinner />
        </div>
      </div>
    );
  }

  // No local sign-in: the Workspace owns every session.
  if (!user) return <WorkspaceHandoff />;
  return <>{children}</>;
}

export function App() {
  const restore = useAuthStore((s) => s.restore);
  const toast = useUIStore((s) => s.toast);
  const dismissToast = useUIStore((s) => s.dismissToast);

  useEffect(() => {
    void restore();

    // When the refresh token is gone for good, tear the session down here
    // instead of hard-navigating and losing React state mid-render.
    setSessionLostHandler(() => {
      disconnectSocket();
      useAuthStore.setState({ user: null, isRestoring: false });
    });
  }, [restore]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Members are managed in the Workspace, so chat keeps no account
            screens of its own. Both old paths simply return to the chat. */}
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/admin" element={<Navigate to="/" replace />} />
        <Route
          path="/"
          element={
            <Protected>
              <ChatPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <CommandPalette />
      <Lightbox />

      <AnimatePresence>
        {toast && (
          <motion.button
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            onClick={dismissToast}
            className="fixed bottom-6 right-6 z-[80] flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink shadow-pop"
          >
            <span
              className={
                'h-2 w-2 rounded-full ' +
                (toast.tone === 'error'
                  ? 'bg-danger'
                  : toast.tone === 'success'
                    ? 'bg-jade'
                    : 'bg-brand')
              }
            />
            {toast.message}
          </motion.button>
        )}
      </AnimatePresence>
    </BrowserRouter>
  );
}
