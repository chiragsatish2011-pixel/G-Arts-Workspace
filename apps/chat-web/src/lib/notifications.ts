import { useEffect, useRef } from 'react';
import { SocketEvents, type Message } from '@g-arts/chat-shared';
import { getSocket } from './socket';
import { useChatStore } from '../stores/chat';
import { useAuthStore } from '../stores/auth';
import { useUIStore } from '../stores/ui';

/**
 * A short synthesised chime. Shipping an audio file for one 0.2s sound is not
 * worth the request, and WebAudio lets it stay silent until the tab has been
 * interacted with, as browsers require.
 */
function chime(kind: 'message' | 'mention') {
  try {
    const Ctx = window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = kind === 'mention' ? [880, 1174] : [660];

    notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + index * 0.09);
      gain.gain.linearRampToValueAtTime(0.05, now + index * 0.09 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.09 + 0.22);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(now + index * 0.09);
      oscillator.stop(now + index * 0.09 + 0.24);
    });

    setTimeout(() => void ctx.close(), 600);
  } catch {
    // Audio is a nicety; never let it break message delivery.
  }
}

/**
 * Desktop notifications and sound for messages that arrive while you are not
 * looking. Deliberately quiet: nothing fires for your own messages, for the
 * conversation you are already reading, or for muted threads.
 */
export function useNotifications() {
  const soundEnabled = useUIStore((s) => s.soundEnabled);
  const permissionAsked = useRef(false);

  useEffect(() => {
    if (!permissionAsked.current && 'Notification' in window && Notification.permission === 'default') {
      permissionAsked.current = true;
      // Ask on the first real interaction rather than on load, which browsers
      // increasingly refuse and users find rude.
      const ask = () => {
        void Notification.requestPermission();
        window.removeEventListener('pointerdown', ask);
      };
      window.addEventListener('pointerdown', ask, { once: true });
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const onMessage = ({ channelId, message }: { channelId: string; message: Message }) => {
      const me = useAuthStore.getState().user;
      if (!me || message.userId === me.id) return;

      const { activeId, conversations } = useChatStore.getState();
      const conversation = conversations.find((c) => c.id === channelId);
      if (!conversation) return;

      const muted =
        conversation.notifyLevel === 'none' ||
        (conversation.mutedUntil ? new Date(conversation.mutedUntil) > new Date() : false);
      if (muted) return;

      const mentionsMe = new RegExp(
        `(^|\\s)@(${me.username}|everyone|channel|here)\\b`,
        'i'
      ).test(message.content);

      if (conversation.notifyLevel === 'mentions' && !mentionsMe) return;

      // Reading the thread already counts as being notified.
      const focused = document.visibilityState === 'visible' && activeId === channelId;
      if (focused && !mentionsMe) return;

      if (soundEnabled) chime(mentionsMe ? 'mention' : 'message');

      if (!focused && 'Notification' in window && Notification.permission === 'granted') {
        const title =
          conversation.kind === 'dm'
            ? (message.user?.displayName ?? 'New message')
            : `${message.user?.displayName ?? 'Someone'} in ${conversation.name}`;

        const notification = new Notification(title, {
          body: message.content.slice(0, 140) || 'Sent an attachment',
          tag: channelId,
          icon: '/garts-icon.svg',
          silent: true
        });
        notification.onclick = () => {
          window.focus();
          void useChatStore.getState().openConversation(channelId);
          notification.close();
        };
      }
    };

    socket.on(SocketEvents.MESSAGE_NEW, onMessage);
    return () => {
      socket.off(SocketEvents.MESSAGE_NEW, onMessage);
    };
  }, [soundEnabled]);
}
