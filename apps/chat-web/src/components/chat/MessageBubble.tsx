import { memo, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  CornerUpLeft,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Smile,
  Trash2,
  X,
  Copy,
  RotateCw
} from 'lucide-react';
import { cn, formatTime, QUICK_REACTIONS } from '@g-arts/chat-shared';
import { useChatStore, isPending, type AnyMessage } from '../../stores/chat';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { Avatar, Button, Tooltip, spring } from '../ui';
import { RichText, isEmojiOnly } from '../../lib/richText';
import { Receipt } from './Receipt';
import { AttachmentView } from './Attachment';
import { ReactionBurst } from './ReactionBurst';

interface Props {
  message: AnyMessage;
  showHeader: boolean;
  isLastOfGroup: boolean;
  knownUsernames: Set<string>;
  onJumpTo?: (messageId: string) => void;
}

function MessageBubbleInner({
  message,
  showHeader,
  isLastOfGroup,
  knownUsernames,
  onJumpTo
}: Props) {
  const me = useAuthStore((s) => s.user);
  const { deleteMessage, react, setReplyTo, setEditing, editMessage, togglePin, retry, discard } =
    useChatStore();
  const editing = useChatStore((s) => s.editing);
  const deliveryStateOf = useChatStore((s) => s.deliveryStateOf);
  const notify = useUIStore((s) => s.notify);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [burst, setBurst] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const isOwn = message.userId === me?.id;
  const isEditing = editing?.id === message.id;
  const pending = isPending(message);
  const state = deliveryStateOf(message);

  const mentionsMe = useMemo(() => {
    if (!me) return false;
    const pattern = new RegExp(`(^|\\s)@(${me.username}|everyone|channel|here)\\b`, 'i');
    return pattern.test(message.content);
  }, [message.content, me]);

  const groupedReactions = useMemo(() => {
    const groups = new Map<string, { emoji: string; count: number; mine: boolean }>();
    for (const reaction of message.reactions ?? []) {
      const entry = groups.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false };
      entry.count++;
      if (reaction.userId === me?.id) entry.mine = true;
      groups.set(reaction.emoji, entry);
    }
    return [...groups.values()];
  }, [message.reactions, me?.id]);

  if (message.deletedAt) {
    return (
      <div className={cn('flex px-1 py-1', isOwn ? 'justify-end' : 'justify-start')}>
        <span className="rounded-full border border-dashed border-line px-3 py-1 text-[12px] italic text-ink-faint">
          This message was deleted
        </span>
      </div>
    );
  }

  const saveEdit = async () => {
    const next = draft.trim();
    if (!next || next === message.content) {
      setEditing(null);
      return;
    }
    await editMessage(message.id, next);
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      notify('Message copied', 'success');
    } catch {
      notify('Could not copy to the clipboard', 'error');
    }
    setMenuOpen(false);
  };

  const big = isEmojiOnly(message.content) && (message.attachments ?? []).length === 0;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: pending && !(pending && message.failed) ? 0.68 : 1, y: 0, scale: 1 }}
      transition={spring}
      className={cn(
        'group/msg relative flex gap-2.5 px-1',
        isLastOfGroup ? 'pb-1' : 'pb-0.5',
        isOwn ? 'flex-row-reverse' : 'flex-row'
      )}
      onMouseLeave={() => {
        setPickerOpen(false);
        setMenuOpen(false);
      }}
    >
      {/* Both sides carry a face, as the reference does — it makes a busy
          channel far easier to scan than one-sided avatars. The column keeps
          its width when collapsed so runs stay aligned. */}
      <div className="w-9 shrink-0 self-end pb-1">
        {isLastOfGroup && (
          <Avatar
            name={message.user?.displayName ?? 'Unknown'}
            src={message.user?.avatarUrl}
            accent={message.user?.accentColor}
            size="md"
          />
        )}
      </div>

      <div className={cn('flex min-w-0 max-w-[min(72%,520px)] flex-col', isOwn && 'items-end')}>
        {showHeader && !isOwn && (
          <div className="mb-1 flex items-baseline gap-2 px-1">
            <span className="text-[13.5px] font-semibold text-ink">
              {message.user?.displayName}
            </span>
            {message.user?.title && (
              <span className="text-[11px] text-ink-faint">{message.user.title}</span>
            )}
          </div>
        )}

        <div className="relative">
          {burst && <ReactionBurst emoji={burst} onDone={() => setBurst(null)} />}
          <div
            className={cn(
              'relative text-[15px] leading-[1.6] transition-colors',
              big ? 'bg-transparent px-1 py-0.5' : 'rounded-[18px] px-3.5 py-2 shadow-card',
              // A tail on the last bubble of a run, the way WhatsApp anchors a
              // message to its speaker. Definition comes from the tail and the
              // shadow rather than from a heavier fill.
              !big && isOwn && 'bg-bubble-own text-ink',
              !big && isOwn && isLastOfGroup && 'rounded-br-[4px] bubble-tail-right',
              !big && !isOwn && 'bg-bubble text-ink',
              !big && !isOwn && isLastOfGroup && 'rounded-bl-[4px] bubble-tail-left',
              mentionsMe && !isOwn && !big && 'bg-brand-soft',
              pending && message.failed && 'ring-1 ring-danger/60'
            )}
          >
            {/* Quoted parent, nested inside the bubble. It used to float above
                and outside it, which read as a broken, detached block. */}
            {message.replyTo && !isEditing && (
              <button
                type="button"
                onClick={() => onJumpTo?.(message.replyTo!.id)}
                className={cn(
                  'mb-1.5 flex w-full items-stretch gap-2 overflow-hidden rounded-[10px] text-left transition-opacity hover:opacity-80',
                  isOwn ? 'bg-ink/[0.07]' : 'bg-ink/[0.05]'
                )}
              >
                <span className={cn('w-[3px] shrink-0 rounded-full', isOwn ? 'bg-brand/70' : 'bg-brand')} />
                <span className="min-w-0 py-1 pr-2">
                  <span className={cn('block truncate text-[12px] font-semibold', isOwn ? 'text-brand-deep' : 'text-brand')}>
                    {message.replyTo.user.displayName}
                  </span>
                  <span className="block truncate text-[12px] text-ink-soft">
                    {message.replyTo.deletedAt
                      ? 'Deleted message'
                      : message.replyTo.content || 'Attachment'}
                  </span>
                </span>
              </button>
            )}

            {isEditing ? (
              <div className="min-w-[260px]">
                <textarea
                  value={draft}
                  autoFocus
                  rows={2}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void saveEdit();
                    }
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  className="w-full resize-none rounded-lg bg-ink/[0.06] px-2 py-1.5 text-[15px] text-ink outline-none"
                />
                <div className="mt-1.5 flex items-center justify-end gap-1">
                  <span className="mr-auto text-2xs opacity-60">Enter to save · Esc to cancel</span>
                  <button
                    onClick={() => setEditing(null)}
                    className="rounded p-1 text-ink-soft hover:bg-ink/10"
                    aria-label="Cancel"
                  >
                    <X size={14} />
                  </button>
                  <button
                    onClick={() => void saveEdit()}
                    className="rounded p-1 text-ink-soft hover:bg-ink/10"
                    aria-label="Save"
                  >
                    <Check size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                {message.content && (
                  <div className={cn('whitespace-pre-wrap break-words', big && 'text-[40px] leading-tight')}>
                    <RichText
                      content={message.content}
                      knownUsernames={knownUsernames}
                      currentUsername={me?.username}
                    />
                  </div>
                )}

                {(message.attachments ?? []).length > 0 && (
                  <div className={cn('grid gap-1.5', message.content && 'mt-2')}>
                    {message.attachments!.map((attachment) => (
                      <AttachmentView
                        key={attachment.id}
                        attachment={attachment}
                        attachments={message.attachments!}
                        own={isOwn}
                      />
                    ))}
                  </div>
                )}

                <span className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] tabular text-ink-faint">
                  {message.editedAt && <span className="italic">edited</span>}
                  {message.pinnedAt && <Pin size={10} className="fill-current" />}
                  <span>{formatTime(message.createdAt)}</span>
                  {isOwn && (
                    <Receipt
                      state={state}
                      onRetry={
                        pending && message.failed ? () => void retry(message.nonce) : undefined
                      }
                    />
                  )}
                </span>
              </>
            )}
          </div>

          {/* Hover toolbar */}
          {!isEditing && !pending && (
            <div
              className={cn(
                'absolute -top-3.5 z-20 flex items-center overflow-hidden rounded-lg border border-line bg-surface shadow-float',
                'opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100 focus-within:opacity-100',
                isOwn ? 'left-0' : 'right-0'
              )}
            >
              <Tooltip label="React">
                <button
                  onClick={() => setPickerOpen((v) => !v)}
                  className="p-1.5 text-ink-soft hover:bg-sunken hover:text-ink"
                  aria-label="Add reaction"
                >
                  <Smile size={15} />
                </button>
              </Tooltip>
              <Tooltip label="Reply">
                <button
                  onClick={() => setReplyTo(message as never)}
                  className="p-1.5 text-ink-soft hover:bg-sunken hover:text-ink"
                  aria-label="Reply"
                >
                  <CornerUpLeft size={15} />
                </button>
              </Tooltip>
              {isOwn && (
                <Tooltip label="Edit">
                  <button
                    onClick={() => {
                      setDraft(message.content);
                      setEditing(message as never);
                    }}
                    className="p-1.5 text-ink-soft hover:bg-sunken hover:text-ink"
                    aria-label="Edit"
                  >
                    <Pencil size={15} />
                  </button>
                </Tooltip>
              )}
              <Tooltip label="More">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="p-1.5 text-ink-soft hover:bg-sunken hover:text-ink"
                  aria-label="More actions"
                >
                  <MoreHorizontal size={15} />
                </button>
              </Tooltip>
            </div>
          )}

          {/* Failed-send actions */}
          {pending && message.failed && (
            <div className={cn('mt-1 flex items-center gap-1.5', isOwn && 'justify-end')}>
              <Button size="sm" variant="subtle" onClick={() => void retry(message.nonce)}>
                <RotateCw size={13} /> Retry
              </Button>
              <Button size="sm" variant="ghost" onClick={() => discard(message.nonce)}>
                Discard
              </Button>
            </div>
          )}

          <AnimatePresence>
            {pickerOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={spring}
                className={cn(
                  'absolute -top-11 z-30 flex gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-pop',
                  isOwn ? 'left-0' : 'right-0'
                )}
              >
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      void react(message.id, emoji);
                      setBurst(emoji);
                      setPickerOpen(false);
                    }}
                    className="rounded-lg p-1.5 text-lg leading-none transition-transform hover:scale-125 hover:bg-sunken"
                  >
                    {emoji}
                  </button>
                ))}
              </motion.div>
            )}

            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={spring}
                className={cn(
                  'absolute top-2 z-30 w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop',
                  isOwn ? 'left-0' : 'right-0'
                )}
              >
                <MenuItem icon={<Copy size={14} />} label="Copy text" onClick={copyText} />
                <MenuItem
                  icon={message.pinnedAt ? <PinOff size={14} /> : <Pin size={14} />}
                  label={message.pinnedAt ? 'Unpin' : 'Pin to conversation'}
                  onClick={() => {
                    void togglePin(message.id, !message.pinnedAt);
                    setMenuOpen(false);
                  }}
                />
                {(isOwn || me?.role === 'admin') && (
                  <MenuItem
                    icon={<Trash2 size={14} />}
                    label="Delete"
                    destructive
                    onClick={() => {
                      void deleteMessage(message.id);
                      setMenuOpen(false);
                    }}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Reactions */}
        {groupedReactions.length > 0 && (
          <div className={cn('-mt-1 flex flex-wrap gap-1 px-1.5', isOwn && 'justify-end')}>
            <AnimatePresence initial={false}>
              {groupedReactions.map((group) => (
                <motion.button
                  key={group.emoji}
                  layout
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={spring}
                  onClick={() => {
                    void react(message.id, group.emoji);
                    if (!group.mine) setBurst(group.emoji);
                  }}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] transition-colors',
                    group.mine
                      ? 'border-brand bg-brand-soft text-brand'
                      : 'border-line bg-surface text-ink-soft hover:border-ink-faint'
                  )}
                >
                  <span className="text-[13px] leading-none">{group.emoji}</span>
                  <span className="tabular font-medium">{group.count}</span>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors',
        destructive ? 'text-danger hover:bg-danger/10' : 'text-ink-soft hover:bg-sunken hover:text-ink'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// Message lists get long; re-rendering every bubble on each keystroke or
// presence tick is the difference between smooth and janky.
export const MessageBubble = memo(MessageBubbleInner, (prev, next) => {
  const a = prev.message;
  const b = next.message;
  return (
    a.id === b.id &&
    a.content === b.content &&
    a.editedAt === b.editedAt &&
    a.deletedAt === b.deletedAt &&
    a.pinnedAt === b.pinnedAt &&
    (a.reactions?.length ?? 0) === (b.reactions?.length ?? 0) &&
    (a.attachments?.length ?? 0) === (b.attachments?.length ?? 0) &&
    (a as { failed?: boolean }).failed === (b as { failed?: boolean }).failed &&
    prev.showHeader === next.showHeader &&
    prev.isLastOfGroup === next.isLastOfGroup
  );
});
