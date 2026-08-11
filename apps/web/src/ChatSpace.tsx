import { useEffect, useRef, useState } from "react";
import type { Session } from "./api";

/**
 * The G-Arts Chat space.
 *
 * Chat remains its own service — `CHAT.md` and `ARCHITECTURE.md` require the
 * existing server to be retained rather than recreated — but the member never
 * sees two products. The chat client is mounted here and handed this session's
 * token over a `postMessage` handshake, so there is no second sign-in.
 *
 * The handshake is origin-checked in both directions: we only answer a frame
 * we loaded ourselves, and we only post to the configured chat origin.
 */

const CHAT_URL: string = import.meta.env.VITE_CHAT_URL ?? "http://localhost:5173";
const CHAT_ORIGIN = new URL(CHAT_URL).origin;

interface ChatSpaceProps {
  session: Session;
  onUnreadChange?: (total: number) => void;
}

export function ChatSpace({ session, onUnreadChange }: ChatSpaceProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unreachable">("loading");

  useEffect(() => {
    let settled = false;

    const send = () => {
      frame.current?.contentWindow?.postMessage(
        {
          type: "garts:workspace:session",
          token: session.token,
          displayName: session.user.displayName,
        },
        CHAT_ORIGIN,
      );
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== CHAT_ORIGIN) return;
      const data = event.data as { type?: string; total?: number } | undefined;

      if (data?.type === "garts:chat:ready") {
        settled = true;
        setState("ready");
        send();
      }
      if (data?.type === "garts:chat:unread" && typeof data.total === "number") {
        onUnreadChange?.(data.total);
      }
    };

    window.addEventListener("message", onMessage);

    // If the chat service is not running, say so instead of showing a blank
    // frame forever.
    const timer = window.setTimeout(() => {
      if (!settled) setState("unreachable");
    }, 8000);

    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
  }, [session.token, session.user.displayName, onUnreadChange]);

  // Re-hand the token whenever the session changes, so a refreshed token
  // reaches the frame without reloading it.
  useEffect(() => {
    if (state !== "ready") return;
    frame.current?.contentWindow?.postMessage(
      { type: "garts:workspace:session", token: session.token },
      CHAT_ORIGIN,
    );
  }, [session.token, state]);

  return (
    <section className="chat-space">
      {state === "unreachable" ? (
        <div className="chat-space-fallback">
          <span className="eyebrow">CHAT</span>
          <h2>The chat service is not responding</h2>
          <p>
            G-Arts Chat runs as its own service. Start it and reload this page — the Workspace will
            reconnect and sign you in automatically.
          </p>
          <code>npm run dev</code>
          <p className="hint">Expected at {CHAT_ORIGIN}</p>
        </div>
      ) : null}

      <iframe
        ref={frame}
        title="G-Arts Chat"
        src={`${CHAT_URL}/?embed=1`}
        className={state === "ready" ? "chat-frame ready" : "chat-frame"}
        allow="microphone; clipboard-write"
        // The frame is a first-party service we operate; it still gets a
        // sandbox so a compromise there cannot navigate the Workspace away.
        sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups"
      />
    </section>
  );
}
