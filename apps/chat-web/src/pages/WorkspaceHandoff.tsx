import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Button, spring } from '../components/ui';
import { Monogram, Wordmark } from '../components/ui/Logo';
import { isEmbedded } from '../lib/embed';

const WORKSPACE_URL: string = import.meta.env.VITE_WORKSPACE_URL ?? 'http://localhost:5174';

/**
 * Chat has no sign-in of its own any more.
 *
 * G-Arts Workspace issues every account and every session; chat simply
 * verifies the token it is given. Anyone who reaches this client directly is
 * sent to the Workspace rather than being asked for a second password that
 * could drift out of step with the first.
 */
export function WorkspaceHandoff() {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    // Inside the shell there is nowhere to send anyone — the parent is already
    // the Workspace, and it is mid-handshake.
    if (isEmbedded) return;

    const tick = setInterval(() => setCountdown((n) => n - 1), 1000);
    const go = setTimeout(() => {
      window.location.href = WORKSPACE_URL;
    }, 3000);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, []);

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas px-4">
      <motion.div
        aria-hidden
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
        className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-brand/10 blur-[120px]"
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="relative z-10 w-full max-w-[420px] text-center"
      >
        <div className="mx-auto mb-5 flex flex-col items-center gap-4">
          <Monogram size={60} />
          <Wordmark height={28} />
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-float">
          <h1 className="font-display text-[19px] font-semibold text-ink">
            {isEmbedded ? 'Connecting to your Workspace session…' : 'Chat opens from the Workspace'}
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
            {isEmbedded
              ? 'One moment — G-Arts Workspace is handing over your session.'
              : 'G-Arts Chat is a space inside G-Arts Workspace. Your Workspace username and password sign you in to everything, so there is nothing separate to remember here.'}
          </p>

          {!isEmbedded && (
            <>
              <Button
                size="lg"
                className="mt-5 w-full"
                onClick={() => {
                  window.location.href = WORKSPACE_URL;
                }}
              >
                Open G-Arts Workspace
                <ArrowRight size={16} />
              </Button>
              <p className="mt-3 text-[12px] text-ink-faint">
                Taking you there {countdown > 0 ? `in ${countdown}…` : 'now…'}
              </p>
            </>
          )}

          <p className="mt-5 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-faint">
            <ShieldCheck size={12} />
            Invite only. Accounts are issued by a G-Arts administrator.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
