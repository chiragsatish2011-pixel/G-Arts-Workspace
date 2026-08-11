import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Hash, Users, Check, Lock } from 'lucide-react';
import { cn } from '@g-arts/chat-shared';
import { useChatStore } from '../../stores/chat';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { Modal, Avatar, Button, Input, spring } from '../ui';
import api, { errorMessage } from '../../lib/api';

type Mode = 'direct' | 'group' | 'channel';

export function NewConversationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useAuthStore((s) => s.user);
  const users = useChatStore((s) => s.users);
  const openDirect = useChatStore((s) => s.openDirect);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const openConversation = useChatStore((s) => s.openConversation);
  const notify = useUIStore((s) => s.notify);

  const [mode, setMode] = useState<Mode>('direct');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users
      .filter((u) => u.id !== me?.id)
      .filter(
        (u) =>
          !needle ||
          u.displayName.toLowerCase().includes(needle) ||
          u.username.toLowerCase().includes(needle)
      );
  }, [users, query, me?.id]);

  const reset = () => {
    setQuery('');
    setSelected(new Set());
    setName('');
    setDescription('');
    setIsPrivate(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (mode === 'direct') {
        next.clear();
        next.add(id);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'direct') {
        const [userId] = [...selected];
        if (!userId) return;
        await openDirect(userId);
      } else if (mode === 'group') {
        const { data } = await api.post('/conversations/group', {
          name: name.trim(),
          memberIds: [...selected]
        });
        await fetchConversations();
        await openConversation(data.conversation.id);
      } else {
        const { data } = await api.post('/conversations', {
          name: name.trim(),
          description: description.trim() || undefined,
          isPrivate,
          memberIds: [...selected]
        });
        await fetchConversations();
        await openConversation(data.conversation.id);
      }
      close();
    } catch (err) {
      notify(errorMessage(err, 'Could not create that conversation'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    mode === 'direct'
      ? selected.size === 1
      : mode === 'group'
        ? selected.size >= 2 && name.trim().length > 0
        : name.trim().length > 0;

  const tabs: Array<[Mode, string, React.ReactNode]> = [
    ['direct', 'Direct', <Avatar key="d" name="A B" size="xs" />],
    ['group', 'Group', <Users key="g" size={14} />],
    ...(me?.role === 'admin'
      ? ([['channel', 'Channel', <Hash key="c" size={14} />]] as Array<[Mode, string, React.ReactNode]>)
      : [])
  ];

  return (
    <Modal
      open={open}
      onClose={close}
      title="Start something new"
      description="Message one person, gather a few, or open a channel for everyone."
    >
      <div className="mb-4 flex gap-1 rounded-xl bg-sunken p-1">
        {tabs.map(([value, label, icon]) => (
          <button
            key={value}
            onClick={() => {
              setMode(value);
              setSelected(new Set());
            }}
            className={cn(
              'relative flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium transition-colors',
              mode === value ? 'text-ink' : 'text-ink-faint hover:text-ink-soft'
            )}
          >
            {mode === value && (
              <motion.span
                layoutId="new-conversation-tab"
                transition={spring}
                className="absolute inset-0 rounded-lg bg-surface shadow-card"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {icon}
              {label}
            </span>
          </button>
        ))}
      </div>

      {mode !== 'direct' && (
        <div className="mb-3 space-y-3">
          <Input
            label={mode === 'group' ? 'Group name' : 'Channel name'}
            placeholder={mode === 'group' ? 'Class 10 teachers' : 'staff-room'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
          {mode === 'channel' && (
            <>
              <Input
                label="Description"
                placeholder="What belongs in here?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
              />
              <button
                onClick={() => setIsPrivate((v) => !v)}
                className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left transition-colors hover:bg-sunken"
              >
                <span
                  className={cn(
                    'grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors',
                    isPrivate ? 'bg-brand text-white' : 'bg-sunken text-ink-faint'
                  )}
                >
                  <Lock size={16} />
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-medium text-ink">Private channel</span>
                  <span className="block text-[11.5px] text-ink-faint">
                    Only the people you add can find or read it
                  </span>
                </span>
                <span
                  className={cn(
                    'h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors',
                    isPrivate ? 'bg-brand' : 'bg-line'
                  )}
                >
                  <motion.span
                    animate={{ x: isPrivate ? 16 : 0 }}
                    transition={spring}
                    className="block h-4 w-4 rounded-full bg-white shadow-sm"
                  />
                </span>
              </button>
            </>
          )}
        </div>
      )}

      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={mode === 'direct' ? 'Find someone' : 'Add people'}
          className="h-10 w-full rounded-xl border border-line bg-sunken pl-8 pr-3 text-[13px] focus:border-brand focus:bg-surface focus:outline-none"
        />
      </div>

      <div className="scroll-slim mb-4 max-h-[280px] space-y-0.5 overflow-y-auto">
        {candidates.length === 0 && (
          <p className="py-8 text-center text-[13px] text-ink-faint">Nobody matches that.</p>
        )}
        {candidates.map((user) => {
          const picked = selected.has(user.id);
          return (
            <button
              key={user.id}
              onClick={() => toggle(user.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                picked ? 'bg-brand-soft' : 'hover:bg-sunken'
              )}
            >
              <Avatar
                name={user.displayName}
                src={user.avatarUrl}
                accent={user.accentColor}
                size="md"
                online={user.isConnected}
                status={user.isConnected ? user.status : 'offline'}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">
                  {user.displayName}
                </span>
                <span className="block truncate text-[11.5px] text-ink-faint">
                  {user.title || `@${user.username}`}
                </span>
              </span>
              <span
                className={cn(
                  'grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors',
                  picked ? 'border-brand bg-brand text-white' : 'border-line'
                )}
              >
                {picked && <Check size={12} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-ink-faint">
          {mode === 'direct'
            ? selected.size === 1
              ? 'Ready to open'
              : 'Pick one person'
            : `${selected.size} selected`}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit} loading={busy}>
            {mode === 'direct' ? 'Open chat' : mode === 'group' ? 'Create group' : 'Create channel'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
