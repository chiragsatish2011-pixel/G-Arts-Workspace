import { setAccessToken } from './api';

/**
 * Embedded mode: chat running inside the G-Arts Workspace shell.
 *
 * The two stay separate services — `CHAT.md` requires it — but the member sees
 * one product. The Workspace hands its own access token across a
 * `postMessage` handshake, so nobody signs in twice, and chat hides the chrome
 * the Workspace already provides (its own brand block and sign-out).
 *
 * Both ends check the other's origin. A token is never accepted from a frame
 * we were not configured to trust.
 */

export interface EmbedHandshake {
  type: 'garts:workspace:session';
  token: string;
  displayName?: string;
  theme?: 'light' | 'dark';
}

const TRUSTED_PARENTS = (import.meta.env.VITE_WORKSPACE_ORIGINS ?? '')
  .split(',')
  .map((o: string) => o.trim())
  .filter(Boolean);

export const isEmbedded = (() => {
  try {
    const flagged = new URLSearchParams(window.location.search).get('embed') === '1';
    return flagged && window.parent !== window;
  } catch {
    return false;
  }
})();

function parentIsTrusted(origin: string): boolean {
  if (TRUSTED_PARENTS.length > 0) return TRUSTED_PARENTS.includes(origin);
  // With nothing configured, only same-machine development hosts are trusted,
  // so a stray page cannot inject a session.
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/**
 * Waits for the Workspace to hand over a session. Resolves with the token, or
 * null if the parent never answers — in which case chat falls back to its own
 * sign-in screen rather than hanging on a blank frame.
 */
export function requestWorkspaceSession(timeoutMs = 6000): Promise<string | null> {
  if (!isEmbedded) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
      clearTimeout(timer);
      resolve(token);
    };

    const onMessage = (event: MessageEvent) => {
      if (!parentIsTrusted(event.origin)) return;
      const data = event.data as EmbedHandshake | undefined;
      if (data?.type !== 'garts:workspace:session' || typeof data.token !== 'string') return;

      setAccessToken(data.token);
      if (data.theme) {
        document.documentElement.dataset.theme = data.theme;
      }
      finish(data.token);
    };

    window.addEventListener('message', onMessage);

    // Announce readiness repeatedly: the parent may mount the frame before it
    // has a session, or after this listener is attached.
    const announce = () => window.parent.postMessage({ type: 'garts:chat:ready' }, '*');
    announce();
    const poll = setInterval(announce, 400);
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

/** Lets the Workspace keep the frame's token fresh without a reload. */
export function listenForSessionRefresh(onToken: (token: string) => void): () => void {
  if (!isEmbedded) return () => undefined;
  const handler = (event: MessageEvent) => {
    if (!parentIsTrusted(event.origin)) return;
    const data = event.data as EmbedHandshake | undefined;
    if (data?.type === 'garts:workspace:session' && typeof data.token === 'string') {
      setAccessToken(data.token);
      onToken(data.token);
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/** Tells the Workspace how many conversations need attention, for its nav badge. */
export function reportUnread(total: number): void {
  if (!isEmbedded) return;
  window.parent.postMessage({ type: 'garts:chat:unread', total }, '*');
}
