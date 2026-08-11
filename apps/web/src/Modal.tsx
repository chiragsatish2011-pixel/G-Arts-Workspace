import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * In-app dialogs.
 *
 * These replace `window.confirm` and `window.prompt`, which put "localhost:5174
 * says" above every question, cannot be styled, and — for the delete flow —
 * meant asking two separate questions in two separate boxes. One dialog that
 * looks like the rest of the product can ask everything at once.
 */

function Shell({
  open, title, children, onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      // A dialog that asks before something irreversible should not let the
      // page behind it take focus while it is open.
      if (event.key === "Tab" && card.current) {
        const focusable = card.current.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const focus = window.setTimeout(() => card.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus(), 20);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      window.clearTimeout(focus);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" ref={card} role="dialog" aria-modal="true" aria-label={title}>
        {children}
      </div>
    </div>
  );
}

function DialogHeader({ title, destructive, onClose }: { title: string; destructive?: boolean; onClose: () => void }) {
  return <div className="modal-header">
    <span className={destructive ? "modal-symbol is-danger" : "modal-symbol"}>{destructive ? "!" : "✓"}</span>
    <div><span className="modal-kicker">{destructive ? "Confirm removal" : "Confirm action"}</span><h2 className={destructive ? "modal-title is-danger" : "modal-title"}>{title}</h2></div>
    <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>
  </div>;
}

export interface ConfirmRequest {
  title: string;
  body: ReactNode;
  /** Wording on the button that goes ahead. */
  confirmLabel: string;
  /** Colours the action red and, if `typeToConfirm` is set, demands it typed. */
  destructive?: boolean;
  typeToConfirm?: string;
  /** An extra opt-in shown as a checkbox, e.g. "also delete their messages". */
  option?: { label: string; hint?: string };
  onConfirm: (option: boolean) => void | Promise<void>;
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [option, setOption] = useState(false);
  const [working, setWorking] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTyped("");
    setOption(false);
    setWorking(false);
    if (request) setTimeout(() => field.current?.focus(), 40);
  }, [request]);

  if (!request) return null;
  const matches = !request.typeToConfirm || typed.trim().toLowerCase() === request.typeToConfirm.toLowerCase();

  const go = async () => {
    if (!matches || working) return;
    setWorking(true);
    try { await request.onConfirm(option); onClose(); } finally { setWorking(false); }
  };

  return (
    <Shell open title={request.title} onClose={onClose}>
      <DialogHeader title={request.title} destructive={request.destructive} onClose={onClose} />
      <div className="modal-body">{request.body}</div>

      {request.option && (
        <label className="modal-option">
          <input type="checkbox" checked={option} onChange={(e) => setOption(e.target.checked)} />
          <span>
            <strong>{request.option.label}</strong>
            {request.option.hint && <small>{request.option.hint}</small>}
          </span>
        </label>
      )}

      {request.typeToConfirm && (
        <label className="modal-field">
          Type <code>{request.typeToConfirm}</code> to confirm
          <input
            ref={field}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void go()}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      )}

      <div className="modal-actions">
        <button type="button" className="modal-cancel" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className={request.destructive ? "modal-go is-danger" : "modal-go"}
          disabled={!matches || working}
          onClick={() => void go()}
        >
          {working ? "Working…" : request.confirmLabel}
        </button>
      </div>
    </Shell>
  );
}

/** Replaces `window.prompt` where a value is being collected, not confirmed. */
export interface PromptRequest {
  title: string;
  body?: ReactNode;
  label: string;
  hint?: string;
  type?: "text" | "password";
  confirmLabel: string;
  minLength?: number;
  onSubmit: (value: string) => void | Promise<void>;
}

export function PromptDialog({ request, onClose }: { request: PromptRequest | null; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [working, setWorking] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue("");
    setWorking(false);
    if (request) setTimeout(() => field.current?.focus(), 40);
  }, [request]);

  if (!request) return null;
  const ready = value.length >= (request.minLength ?? 1);

  const go = async () => {
    if (!ready || working) return;
    setWorking(true);
    try { await request.onSubmit(value); onClose(); } finally { setWorking(false); }
  };

  return (
    <Shell open title={request.title} onClose={onClose}>
      <DialogHeader title={request.title} onClose={onClose} />
      {request.body && <div className="modal-body">{request.body}</div>}

      <label className="modal-field">
        {request.label}
        <input
          ref={field}
          type={request.type ?? "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void go()}
          autoComplete={request.type === "password" ? "new-password" : "off"}
        />
        {request.hint && <small className="modal-hint">{request.hint}</small>}
      </label>

      <div className="modal-actions">
        <button type="button" className="modal-cancel" onClick={onClose}>Cancel</button>
        <button type="button" className="modal-go" disabled={!ready || working} onClick={() => void go()}>
          {working ? "Working…" : request.confirmLabel}
        </button>
      </div>
    </Shell>
  );
}
