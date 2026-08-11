import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  Monitor,
  Moon,
  Sun,
  LogOut,
  Laptop,
  Camera,
  Trash2,
  Loader2,
  KeyRound
} from 'lucide-react';
import { cn, timeAgo, SocketEvents } from '@g-arts/chat-shared';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { getSocket } from '../../lib/socket';
import { forgetMedia } from '../../lib/media';
import { Modal, Avatar, Button, Input, Spinner, spring } from '../ui';
import api, { errorMessage } from '../../lib/api';

const STATUSES = [
  { value: 'online', label: 'Online', color: 'bg-jade' },
  { value: 'away', label: 'Away', color: 'bg-gold' },
  { value: 'busy', label: 'Do not disturb', color: 'bg-danger' },
  { value: 'offline', label: 'Appear offline', color: 'bg-ink-faint' }
] as const;

/** Warm, restrained accents that sit well against the Gurukul palette. */
const ACCENTS = [
  '#a8121a',
  '#b5651e',
  '#c08a2e',
  '#2f6f4f',
  '#2f7d8a',
  '#3d5a8a',
  '#6b4a8a',
  '#7a4a2a'
];

/** One-tap status lines, so nobody has to think of the wording. */
const STATUS_PRESETS = [
  '📚 In class',
  '🧘 In prayer',
  '🍵 On a break',
  '🗓️ In a meeting',
  '🏫 On campus',
  '🚌 Travelling'
];

interface Session {
  id: string;
  deviceInfo: string | null;
  ip: string | null;
  lastUsedAt: string;
  createdAt: string;
  current: boolean;
}

export function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const { theme, setTheme } = useUIStore();
  const notify = useUIStore((s) => s.notify);

  const [tab, setTab] = useState<'profile' | 'security'>('profile');
  const [displayName, setDisplayName] = useState('');
  const [title, setTitle] = useState('');
  const [statusText, setStatusText] = useState('');
  const [accent, setAccent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setDisplayName(user.displayName);
    setTitle(user.title ?? '');
    setStatusText(user.statusText ?? '');
    setAccent(user.accentColor);
    setTab('profile');
    setCurrentPassword('');
    setNewPassword('');
  }, [open, user]);

  useEffect(() => {
    if (tab !== 'security' || !open) return;
    setSessions(null);
    api
      .get('/auth/sessions')
      .then(({ data }) => setSessions(data.sessions))
      .catch(() => setSessions([]));
  }, [tab, open]);

  if (!user) return null;

  const dirty =
    displayName.trim() !== user.displayName ||
    title.trim() !== (user.title ?? '') ||
    statusText.trim() !== (user.statusText ?? '') ||
    accent !== user.accentColor;

  const setStatus = (status: string) => {
    getSocket().emit(SocketEvents.PRESENCE_SET, { status });
    void updateProfile({ status: status as never });
  };

  const uploadPhoto = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      notify('Choose an image file', 'error');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      notify('That image is larger than 8 MB', 'error');
      return;
    }

    setUploading(true);
    const previous = user.avatarUrl;
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/users/me/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      // Drop the cached blob so the new photo is not masked by the old one.
      if (previous) forgetMedia(previous);
      useAuthStore.setState({ user: data.user });
      notify('Profile picture updated', 'success');
    } catch (err) {
      notify(errorMessage(err, 'Could not upload that picture'), 'error');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    const previous = user.avatarUrl;
    try {
      const { data } = await api.delete('/users/me/avatar');
      if (previous) forgetMedia(previous);
      useAuthStore.setState({ user: data.user });
      notify('Profile picture removed', 'success');
    } catch (err) {
      notify(errorMessage(err, 'Could not remove the picture'), 'error');
    }
  };

  const save = async () => {
    setSaving(true);
    const ok = await updateProfile({
      displayName: displayName.trim(),
      title: title.trim() || null,
      statusText: statusText.trim() || null,
      accentColor: accent
    });
    setSaving(false);
    notify(ok ? 'Profile saved' : 'Could not save your profile', ok ? 'success' : 'error');
  };

  const changePassword = async () => {
    setChangingPassword(true);
    try {
      await api.post('/users/me/password', { currentPassword, newPassword });
      notify('Password changed — signing you out everywhere', 'success');
      setTimeout(() => void useAuthStore.getState().logout(), 1200);
    } catch (err) {
      notify(errorMessage(err, 'Could not change your password'), 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await api.delete(`/auth/sessions/${id}`);
      setSessions((current) => current?.filter((s) => s.id !== id) ?? null);
      notify('That device was signed out', 'success');
    } catch (err) {
      notify(errorMessage(err, 'Could not sign that device out'), 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Your profile" width="max-w-xl">
      <div className="mb-5 flex gap-1 rounded-xl bg-sunken p-1">
        {(
          [
            ['profile', 'Profile'],
            ['security', 'Security and devices']
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              'relative flex-1 rounded-lg py-2 text-[13px] font-medium transition-colors',
              tab === value ? 'text-ink' : 'text-ink-faint hover:text-ink-soft'
            )}
          >
            {tab === value && (
              <motion.span
                layoutId="profile-tab"
                transition={spring}
                className="absolute inset-0 rounded-lg bg-surface shadow-card"
              />
            )}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {tab === 'profile' ? (
        <>
          {/* Photo */}
          <div className="mb-6 flex items-center gap-5">
            <div className="group relative">
              <Avatar
                name={user.displayName}
                src={user.avatarUrl}
                accent={accent ?? user.accentColor}
                size="xl"
                online
                status={user.status}
              />
              <button
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className={cn(
                  'absolute inset-0 grid place-items-center rounded-full bg-ink/55 text-white',
                  'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100'
                )}
                aria-label="Change profile picture"
              >
                {uploading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadPhoto(file);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold text-ink">{user.displayName}</p>
              <p className="text-[12.5px] text-ink-faint">
                @{user.username} · {user.role === 'admin' ? 'Administrator' : 'Member'}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                  <Camera size={13} /> {user.avatarUrl ? 'Change photo' : 'Add photo'}
                </Button>
                {user.avatarUrl && (
                  <Button size="sm" variant="ghost" onClick={() => void removePhoto()}>
                    <Trash2 size={13} /> Remove
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Identity */}
          <div className="mb-5 space-y-3">
            <Input
              label="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
            />
            <Input
              label="Role or title"
              placeholder="Teacher"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
            />
            <div>
              <Input
                label="What you're up to"
                placeholder="In class until 4"
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                maxLength={120}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STATUS_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setStatusText(preset)}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-soft transition-colors hover:border-brand/40 hover:text-ink"
                  >
                    {preset}
                  </button>
                ))}
                {statusText && (
                  <button
                    onClick={() => setStatusText('')}
                    className="rounded-full px-2.5 py-1 text-[12px] text-ink-faint hover:text-danger"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Accent */}
          <p className="eyebrow mb-2">Your colour</p>
          <div className="mb-5 flex flex-wrap gap-2">
            {ACCENTS.map((colour) => (
              <button
                key={colour}
                onClick={() => setAccent(colour)}
                aria-label={`Use ${colour}`}
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-full transition-transform hover:scale-110',
                  accent === colour && 'ring-2 ring-ink ring-offset-2 ring-offset-surface'
                )}
                style={{ backgroundColor: colour }}
              >
                {accent === colour && <Check size={14} className="text-white" />}
              </button>
            ))}
          </div>

          {/* Presence */}
          <p className="eyebrow mb-2">Presence</p>
          <div className="mb-5 grid grid-cols-2 gap-1.5">
            {STATUSES.map((status) => (
              <button
                key={status.value}
                onClick={() => setStatus(status.value)}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] transition-colors',
                  user.status === status.value
                    ? 'border-brand bg-brand-soft text-ink'
                    : 'border-line text-ink-soft hover:bg-sunken'
                )}
              >
                <span className={cn('h-2.5 w-2.5 rounded-full', status.color)} />
                {status.label}
                {user.status === status.value && <Check size={13} className="ml-auto text-brand" />}
              </button>
            ))}
          </div>

          {/* Appearance */}
          <p className="eyebrow mb-2">Appearance</p>
          <div className="mb-5 grid grid-cols-3 gap-1.5">
            {(
              [
                ['light', 'Light', <Sun key="l" size={15} />],
                ['dark', 'Dark', <Moon key="d" size={15} />],
                ['system', 'System', <Monitor key="s" size={15} />]
              ] as const
            ).map(([value, label, icon]) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl border py-3 text-[12px] transition-colors',
                  theme === value
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-line text-ink-soft hover:bg-sunken'
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <AnimatePresence>
              {dirty && (
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-[12px] text-ink-faint"
                >
                  You have unsaved changes
                </motion.span>
              )}
            </AnimatePresence>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => void save()} loading={saving} disabled={!dirty}>
                Save changes
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="eyebrow mb-2">Change your password</p>
          <div className="mb-3 space-y-3">
            <Input
              type="password"
              label="Current password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <Input
              type="password"
              label="New password"
              hint="At least 10 characters. Every device will be signed out."
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            className="mb-6 w-full"
            loading={changingPassword}
            disabled={!currentPassword || newPassword.length < 10}
            onClick={() => void changePassword()}
          >
            <KeyRound size={14} /> Change password
          </Button>

          <p className="eyebrow mb-2">Signed-in devices</p>
          <p className="mb-3 text-[12.5px] text-ink-soft">
            Sign out anything you do not recognise.
          </p>

          {sessions === null ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center gap-3 rounded-xl border border-line bg-sunken p-3"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface text-ink-soft">
                    <Laptop size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {describeDevice(session.deviceInfo)}
                      {session.current && (
                        <span className="ml-2 rounded bg-jade/15 px-1.5 py-0.5 text-2xs font-semibold text-jade">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11.5px] text-ink-faint">
                      {session.ip ?? 'Unknown network'} · active {timeAgo(session.lastUsedAt)}
                    </p>
                  </div>
                  {!session.current && (
                    <button
                      onClick={() => void revoke(session.id)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger"
                      title="Sign this device out"
                    >
                      <LogOut size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/** Turns a raw user-agent string into something a person can recognise. */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const platform = /iPhone|iPad/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown';
  return `${browser} on ${platform}`;
}
