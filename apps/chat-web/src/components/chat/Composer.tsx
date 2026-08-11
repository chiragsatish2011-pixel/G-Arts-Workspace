import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CornerUpLeft,
  Mic,
  Paperclip,
  Send,
  Smile,
  Square,
  X,
  FileText,
  Loader2
} from 'lucide-react';
import { cn, throttle, formatFileSize, isImage } from '@g-arts/chat-shared';
import { useChatStore } from '../../stores/chat';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import api, { errorMessage } from '../../lib/api';
import { Button, Tooltip, Avatar, spring } from '../ui';
import { EmojiPicker } from './EmojiPicker';
import {
  MentionPicker,
  useMentionOptions,
  findMentionQuery,
  type MentionQuery
} from './MentionPicker';

interface StagedFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  previewUrl?: string;
}

const DRAFT_PREFIX = 'garts-draft:';

export function Composer({ channelId, disabled, placeholder }: {
  channelId: string;
  disabled?: boolean;
  placeholder: string;
}) {
  const { send, setTyping, replyTo, setReplyTo } = useChatStore();
  const conversation = useChatStore((s) => s.conversations.find((c) => c.id === channelId));
  const messages = useChatStore((s) => s.messages[channelId]);
  const setEditing = useChatStore((s) => s.setEditing);
  const me = useAuthStore((s) => s.user);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const notify = useUIStore((s) => s.notify);

  const [value, setValue] = useState('');
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Drafts survive switching conversations and reloading the page.
  useEffect(() => {
    setValue(localStorage.getItem(DRAFT_PREFIX + channelId) ?? '');
    setStaged([]);
    requestAnimationFrame(() => textarea.current?.focus());
  }, [channelId]);

  useEffect(() => {
    if (value) localStorage.setItem(DRAFT_PREFIX + channelId, value);
    else localStorage.removeItem(DRAFT_PREFIX + channelId);
  }, [value, channelId]);

  useEffect(() => {
    if (replyTo) textarea.current?.focus();
  }, [replyTo]);

  // Throttled, so a fast typist emits a couple of events a second rather than
  // one per keystroke.
  const emitTyping = useRef(
    throttle(() => {
      setTyping(channelId);
    }, 2200)
  ).current;

  const mentionOptions = useMentionOptions(conversation, mention);

  useEffect(() => {
    setMentionIndex(0);
  }, [mention?.term]);

  const autosize = useCallback(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(autosize, [value, autosize]);

  const upload = useCallback(
    async (files: File[], durationMs?: number) => {
      if (files.length === 0) return;
      setUploading(true);
      for (const file of files.slice(0, 5)) {
        const form = new FormData();
        form.append('file', file);
        // The server cannot cheaply probe an audio container for its length,
        // so a voice note reports how long it recorded for.
        if (durationMs) form.append('durationMs', String(Math.round(durationMs)));
        try {
          const { data } = await api.post('/files/upload', form, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          setStaged((current) => [
            ...current,
            {
              id: data.attachment.id,
              fileName: data.attachment.fileName,
              fileSize: data.attachment.fileSize,
              mimeType: data.attachment.mimeType,
              previewUrl: isImage(file.type) ? URL.createObjectURL(file) : undefined
            }
          ]);
        } catch (err) {
          notify(errorMessage(err, `${file.name} could not be uploaded`), 'error');
        }
      }
      setUploading(false);
    },
    [notify]
  );

  const submit = async () => {
    const content = value.trim();
    if ((!content && staged.length === 0) || disabled) return;

    setValue('');
    setStaged([]);
    localStorage.removeItem(DRAFT_PREFIX + channelId);
    requestAnimationFrame(autosize);

    // A brief acknowledgement that the message left — the icon lifts away and
    // returns. Purely confirmation, nothing to chase.
    setJustSent(true);
    window.setTimeout(() => setJustSent(false), 320);

    await send(content, staged.map((s) => s.id));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // While the mention list is open it owns Up/Down/Enter/Tab/Esc.
    if (mention && mentionOptions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionOptions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionOptions.length) % mentionOptions.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        applyMention(mentionOptions[mentionIndex].username);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMention(null);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
      return;
    }
    // Empty box + Up arrow edits your last message, as Slack and WhatsApp do.
    if (event.key === 'ArrowUp' && value.length === 0 && me) {
      const mine = [...(messages ?? [])]
        .reverse()
        .find((m) => m.userId === me.id && !m.deletedAt && !('pending' in m));
      if (mine) {
        event.preventDefault();
        setEditing(mine as never);
      }
      return;
    }
    if (event.key === 'Escape' && replyTo) {
      setReplyTo(null);
    }
  };

  /** Swaps the half-typed handle for the chosen one and moves the caret past it. */
  function applyMention(handle: string) {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(mention.start + 1 + mention.term.length);
    const next = `${before}@${handle} ${after}`;
    setValue(next);
    setMention(null);
    requestAnimationFrame(() => {
      const caret = before.length + handle.length + 2;
      textarea.current?.focus();
      textarea.current?.setSelectionRange(caret, caret);
    });
  }

  /** Pasting an image straight into the box uploads it. */
  const onPaste = (event: React.ClipboardEvent) => {
    const files = [...event.clipboardData.files];
    if (files.length > 0) {
      event.preventDefault();
      void upload(files);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType: mime });

      const startedAt = Date.now();
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mime });
        if (blob.size === 0) return;
        const extension = mime === 'audio/webm' ? 'weba' : 'm4a';
        await upload(
          [new File([blob], `voice-note.${extension}`, { type: mime })],
          Date.now() - startedAt
        );
      };

      rec.start();
      recorder.current = rec;
      setRecording(true);
      setRecordSeconds(0);
      recordTimer.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      notify('Microphone access was declined', 'error');
    }
  };

  const stopRecording = (keep: boolean) => {
    if (recordTimer.current) clearInterval(recordTimer.current);
    const rec = recorder.current;
    if (!rec) return;
    if (!keep) {
      // Discard the take but still release the microphone.
      rec.onstop = () => rec.stream.getTracks().forEach((t) => t.stop());
    }
    rec.stop();
    recorder.current = null;
    setRecording(false);
    setRecordSeconds(0);
  };

  return (
    <div
      className="relative px-4 pb-4 pt-1 sm:px-8"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload([...e.dataTransfer.files]);
      }}
    >
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-2 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-brand bg-brand-soft/90 backdrop-blur-sm"
          >
            <span className="text-sm font-medium text-brand">Drop to attach</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto w-full max-w-[760px]">
        {/* Reply context */}
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ opacity: 0, y: 8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring}
              className="mb-1.5 flex items-center gap-2 rounded-xl border border-line border-l-2 border-l-brand bg-surface px-3 py-2"
            >
              <CornerUpLeft size={14} className="shrink-0 text-brand" />
              <Avatar
                name={replyTo.user?.displayName ?? '?'}
                src={replyTo.user?.avatarUrl}
                accent={replyTo.user?.accentColor}
                size="xs"
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">
                <span className="font-medium text-ink">{replyTo.user?.displayName}</span>
                <span className="ml-2 text-ink-soft">{replyTo.content.slice(0, 110)}</span>
              </span>
              <button
                onClick={() => setReplyTo(null)}
                className="rounded p-1 text-ink-faint hover:bg-sunken hover:text-ink"
                aria-label="Cancel reply"
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Staged attachments */}
        <AnimatePresence>
          {staged.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-1.5 flex flex-wrap gap-2"
            >
              {staged.map((file) => (
                <motion.div
                  key={file.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group/file relative flex items-center gap-2 rounded-xl border border-line bg-surface p-1.5 pr-3"
                >
                  {file.previewUrl ? (
                    <img
                      src={file.previewUrl}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-soft text-brand">
                      <FileText size={16} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block max-w-[160px] truncate text-[12.5px] font-medium text-ink">
                      {file.fileName}
                    </span>
                    <span className="text-[11px] text-ink-faint">
                      {formatFileSize(file.fileSize)}
                    </span>
                  </span>
                  <button
                    onClick={() => setStaged((c) => c.filter((f) => f.id !== file.id))}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-canvas opacity-0 transition-opacity group-hover/file:opacity-100"
                    aria-label={`Remove ${file.fileName}`}
                  >
                    <X size={11} />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recording bar replaces the box while a voice note is being captured. */}
        <AnimatePresence mode="wait">
          {recording ? (
            <motion.div
              key="recording"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="flex items-center gap-3 rounded-2xl border border-danger/40 bg-surface px-4 py-3 shadow-card"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
              </span>
              <span className="text-sm font-medium text-ink">Recording</span>
              <span className="tabular text-sm text-ink-soft">
                {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}
              </span>
              <div className="flex flex-1 items-center gap-[2px] overflow-hidden">
                {Array.from({ length: 40 }, (_, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-danger/60 animate-breathe"
                    style={{
                      height: `${20 + Math.abs(Math.sin(i * 0.7 + recordSeconds)) * 60}%`,
                      animationDelay: `${i * 40}ms`
                    }}
                  />
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => stopRecording(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => stopRecording(true)}>
                <Square size={12} className="fill-current" /> Stop
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="composer"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'relative flex items-end gap-1 rounded-[22px] border bg-canvas px-1.5 py-1 transition-colors',
                'focus-within:border-ink-faint/40 focus-within:bg-surface focus-within:shadow-card',
                disabled ? 'border-line-soft opacity-60' : 'border-line'
              )}
            >
              <Tooltip label="Attach a file">
                <button
                  onClick={() => fileInput.current?.click()}
                  disabled={disabled || uploading}
                  className="grid h-9 w-9 place-items-center rounded-xl text-ink-faint transition-colors hover:bg-sunken hover:text-ink disabled:opacity-50"
                  aria-label="Attach a file"
                >
                  {uploading ? <Loader2 size={17} className="animate-spin" /> : <Paperclip size={17} />}
                </button>
              </Tooltip>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void upload([...(e.target.files ?? [])]);
                  e.target.value = '';
                }}
              />

              <AnimatePresence>
                {mention && mentionOptions.length > 0 && (
                  <MentionPicker
                    options={mentionOptions}
                    activeIndex={mentionIndex}
                    onHover={setMentionIndex}
                    onPick={applyMention}
                  />
                )}
              </AnimatePresence>
              <textarea
                ref={textarea}
                rows={1}
                value={value}
                disabled={disabled}
                placeholder={placeholder}
                onChange={(e) => {
                  setValue(e.target.value);
                  setMention(findMentionQuery(e.target.value, e.target.selectionStart ?? 0));
                  if (e.target.value) emitTyping();
                }}
                onClick={(e) =>
                  setMention(
                    findMentionQuery(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
                  )
                }
                onBlur={() => setTimeout(() => setMention(null), 120)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none scroll-slim"
              />

              <div className="relative flex items-center">
                <Tooltip label="Emoji">
                  <button
                    onClick={() => setEmojiOpen((v) => !v)}
                    disabled={disabled}
                    className="grid h-9 w-9 place-items-center rounded-xl text-ink-faint transition-colors hover:bg-sunken hover:text-ink"
                    aria-label="Insert emoji"
                  >
                    <Smile size={17} />
                  </button>
                </Tooltip>
                <AnimatePresence>
                  {emojiOpen && (
                    <EmojiPicker
                      onSelect={(emoji) => {
                        setValue((v) => v + emoji);
                        setEmojiOpen(false);
                        textarea.current?.focus();
                      }}
                      onClose={() => setEmojiOpen(false)}
                    />
                  )}
                </AnimatePresence>
              </div>

              {value.trim() || staged.length > 0 ? (
                <motion.button
                  key="send"
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={spring}
                  onClick={() => void submit()}
                  disabled={disabled}
                  whileTap={{ scale: 0.88 }}
                  className="grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-brand text-white shadow-card transition-colors hover:bg-brand-deep"
                  aria-label="Send message"
                >
                  <Send size={16} className={justSent ? 'animate-send-off' : undefined} />
                </motion.button>
              ) : (
                <Tooltip label="Record a voice note">
                  <motion.button
                    key="mic"
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={spring}
                    onClick={() => void startRecording()}
                    disabled={disabled}
                    className="grid h-9 w-9 place-items-center rounded-xl text-ink-faint transition-colors hover:bg-sunken hover:text-ink"
                    aria-label="Record a voice note"
                  >
                    <Mic size={17} />
                  </motion.button>
                </Tooltip>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-1.5 hidden px-3 text-[11px] text-ink-faint sm:block">
          Enter to send · Shift + Enter for a new line
        </p>
      </div>
    </div>
  );
}
