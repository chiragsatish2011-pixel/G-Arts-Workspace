import { create } from 'zustand';
import { SocketEvents, type Conversation, type Message, type DeliveryState } from '@g-arts/chat-shared';
import api, { errorMessage } from '../lib/api';
import { getSocket, emitAck } from '../lib/socket';
import { useAuthStore } from './auth';

/** A message the client is still trying to deliver. */
export interface OutboxItem {
  nonce: string;
  channelId: string;
  content: string;
  replyToId: string | null;
  attachmentIds: string[];
  attempts: number;
  failed: boolean;
  createdAt: string;
}

export interface PendingMessage extends Message {
  pending: true;
  failed: boolean;
  nonce: string;
}

export type AnyMessage = Message | PendingMessage;

export const isPending = (m: AnyMessage): m is PendingMessage =>
  (m as PendingMessage).pending === true;

interface TypingEntry {
  userId: string;
  displayName: string;
  expiresAt: number;
}

interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  messages: Record<string, AnyMessage[]>;
  hasMore: Record<string, boolean>;
  loadingMessages: Record<string, boolean>;
  typing: Record<string, TypingEntry[]>;
  outbox: OutboxItem[];
  users: Conversation['members'][number]['user'][];
  pinned: Record<string, Message[]>;
  replyTo: Message | null;
  editing: Message | null;
  error: string | null;
  initialised: boolean;

  bootstrap: () => Promise<void>;
  fetchConversations: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  openDirect: (userId: string) => Promise<string | null>;
  loadOlder: (channelId: string) => Promise<void>;
  fetchPinned: (channelId: string) => Promise<void>;

  send: (content: string, attachmentIds?: string[]) => Promise<void>;
  retry: (nonce: string) => Promise<void>;
  discard: (nonce: string) => void;
  flushOutbox: () => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  react: (messageId: string, emoji: string) => Promise<void>;
  togglePin: (messageId: string, pinned: boolean) => Promise<void>;
  markRead: (channelId: string, messageId?: string) => void;

  setReplyTo: (message: Message | null) => void;
  setEditing: (message: Message | null) => void;
  setTyping: (channelId: string) => void;
  clearError: () => void;

  attachSocket: () => () => void;
  deliveryStateOf: (message: AnyMessage) => DeliveryState;
}

const OUTBOX_KEY = 'garts-outbox';
const TYPING_TTL = 5000;

function loadOutbox(): OutboxItem[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveOutbox(outbox: OutboxItem[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox.slice(-100)));
}

function newNonce() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Keeps a channel's list ordered and free of duplicates after a merge. */
function mergeMessage(list: AnyMessage[], incoming: AnyMessage): AnyMessage[] {
  const nonce = (incoming as PendingMessage).nonce ?? incoming.clientNonce;
  const next = list.filter((m) => {
    if (m.id === incoming.id) return false;
    // The server echo replaces the optimistic placeholder that shares its nonce.
    if (nonce && ((m as PendingMessage).nonce === nonce || m.clientNonce === nonce)) return false;
    return true;
  });
  next.push(incoming);
  next.sort((a, b) => {
    const t = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });
  return next;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
  messages: {},
  hasMore: {},
  loadingMessages: {},
  typing: {},
  outbox: loadOutbox(),
  users: [],
  pinned: {},
  replyTo: null,
  editing: null,
  error: null,
  initialised: false,

  // ---------------------------------------------------------------------------

  bootstrap: async () => {
    await Promise.all([get().fetchConversations(), get().fetchUsers()]);
    set({ initialised: true });
    void get().flushOutbox();
  },

  fetchConversations: async () => {
    try {
      const { data } = await api.get<{ conversations: Conversation[] }>('/conversations');
      set({ conversations: data.conversations });
    } catch (err) {
      set({ error: errorMessage(err, 'Could not load your conversations') });
    }
  },

  fetchUsers: async () => {
    try {
      const { data } = await api.get('/users');
      set({ users: data.users });
    } catch {
      // The roster is a nicety; a failure here should not block the app.
    }
  },

  openConversation: async (id) => {
    const previous = get().activeId;
    if (previous === id) return;

    set({ activeId: id, replyTo: null, editing: null });

    const socket = getSocket();
    if (previous) socket.emit(SocketEvents.CONVERSATION_UNSUBSCRIBE, { channelId: previous });
    socket.emit(SocketEvents.CONVERSATION_SUBSCRIBE, { channelId: id });

    if (!get().messages[id]) {
      set((s) => ({ loadingMessages: { ...s.loadingMessages, [id]: true } }));
      try {
        const { data } = await api.get(`/conversations/${id}/messages?limit=50`);
        set((s) => ({
          messages: { ...s.messages, [id]: data.data },
          hasMore: { ...s.hasMore, [id]: data.hasMore },
          loadingMessages: { ...s.loadingMessages, [id]: false }
        }));
      } catch (err) {
        set((s) => ({
          loadingMessages: { ...s.loadingMessages, [id]: false },
          error: errorMessage(err, 'Could not load this conversation')
        }));
        return;
      }
    }

    void get().fetchPinned(id);
    const list = get().messages[id] ?? [];
    const last = [...list].reverse().find((m) => !isPending(m));
    get().markRead(id, last?.id);
  },

  openDirect: async (userId) => {
    try {
      const { data } = await api.post('/conversations/direct', { userId });
      await get().fetchConversations();
      await get().openConversation(data.conversation.id);
      return data.conversation.id;
    } catch (err) {
      set({ error: errorMessage(err, 'Could not open that conversation') });
      return null;
    }
  },

  loadOlder: async (channelId) => {
    const { hasMore, loadingMessages, messages } = get();
    if (!hasMore[channelId] || loadingMessages[channelId]) return;

    const oldest = (messages[channelId] ?? []).find((m) => !isPending(m));
    if (!oldest) return;

    set((s) => ({ loadingMessages: { ...s.loadingMessages, [channelId]: true } }));
    try {
      const { data } = await api.get(
        `/conversations/${channelId}/messages?limit=50&before=${oldest.id}`
      );
      set((s) => ({
        messages: { ...s.messages, [channelId]: [...data.data, ...(s.messages[channelId] ?? [])] },
        hasMore: { ...s.hasMore, [channelId]: data.hasMore },
        loadingMessages: { ...s.loadingMessages, [channelId]: false }
      }));
    } catch {
      set((s) => ({ loadingMessages: { ...s.loadingMessages, [channelId]: false } }));
    }
  },

  fetchPinned: async (channelId) => {
    try {
      const { data } = await api.get(`/conversations/${channelId}/pins`);
      set((s) => ({ pinned: { ...s.pinned, [channelId]: data.messages } }));
    } catch {
      /* pins are supplementary */
    }
  },

  // ---------------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------------

  send: async (content, attachmentIds = []) => {
    const { activeId, replyTo } = get();
    const me = useAuthStore.getState().user;
    if (!activeId || !me) return;
    if (!content.trim() && attachmentIds.length === 0) return;

    const nonce = newNonce();
    const item: OutboxItem = {
      nonce,
      channelId: activeId,
      content,
      replyToId: replyTo?.id ?? null,
      attachmentIds,
      attempts: 0,
      failed: false,
      createdAt: new Date().toISOString()
    };

    // Render immediately. The nonce lets the server echo replace this exact
    // placeholder, and makes a retry idempotent instead of double-posting.
    const optimistic: PendingMessage = {
      id: `pending:${nonce}`,
      channelId: activeId,
      userId: me.id,
      content,
      type: attachmentIds.length > 0 ? 'file' : 'text',
      replyToId: replyTo?.id ?? null,
      clientNonce: nonce,
      editedAt: null,
      deletedAt: null,
      pinnedAt: null,
      pinnedById: null,
      createdAt: item.createdAt,
      user: me,
      reactions: [],
      attachments: [],
      replyTo: replyTo
        ? {
            id: replyTo.id,
            content: replyTo.content,
            type: replyTo.type,
            deletedAt: replyTo.deletedAt,
            createdAt: replyTo.createdAt,
            user: replyTo.user!
          }
        : null,
      pending: true,
      failed: false,
      nonce
    };

    const outbox = [...get().outbox, item];
    saveOutbox(outbox);
    set((s) => ({
      outbox,
      replyTo: null,
      messages: { ...s.messages, [activeId]: mergeMessage(s.messages[activeId] ?? [], optimistic) }
    }));

    await deliver(item, set, get);
  },

  retry: async (nonce) => {
    const item = get().outbox.find((o) => o.nonce === nonce);
    if (!item) return;
    set((s) => ({
      outbox: s.outbox.map((o) => (o.nonce === nonce ? { ...o, failed: false } : o)),
      messages: {
        ...s.messages,
        [item.channelId]: (s.messages[item.channelId] ?? []).map((m) =>
          isPending(m) && m.nonce === nonce ? { ...m, failed: false } : m
        )
      }
    }));
    await deliver(item, set, get);
  },

  discard: (nonce) => {
    const item = get().outbox.find((o) => o.nonce === nonce);
    const outbox = get().outbox.filter((o) => o.nonce !== nonce);
    saveOutbox(outbox);
    set((s) => ({
      outbox,
      messages: item
        ? {
            ...s.messages,
            [item.channelId]: (s.messages[item.channelId] ?? []).filter(
              (m) => !(isPending(m) && m.nonce === nonce)
            )
          }
        : s.messages
    }));
  },

  /** Re-sends everything queued while offline, oldest first. */
  flushOutbox: async () => {
    const queued = get().outbox.filter((o) => !o.failed);
    for (const item of queued) {
      await deliver(item, set, get);
    }
  },

  editMessage: async (messageId, content) => {
    const { activeId } = get();
    if (!activeId) return;
    try {
      const res = await emitAck<{ ok: boolean; message?: Message; error?: string }>(
        SocketEvents.MESSAGE_EDIT,
        { messageId, content }
      );
      if (!res.ok) throw new Error(res.error);
      set({ editing: null });
    } catch {
      try {
        const { data } = await api.patch(`/conversations/${activeId}/messages/${messageId}`, {
          content
        });
        set((s) => ({
          editing: null,
          messages: { ...s.messages, [activeId]: mergeMessage(s.messages[activeId] ?? [], data.message) }
        }));
      } catch (err) {
        set({ error: errorMessage(err, 'Your edit could not be saved') });
      }
    }
  },

  deleteMessage: async (messageId) => {
    const { activeId } = get();
    if (!activeId) return;
    try {
      await emitAck(SocketEvents.MESSAGE_DELETE, { messageId });
    } catch {
      try {
        await api.delete(`/conversations/${activeId}/messages/${messageId}`);
      } catch (err) {
        set({ error: errorMessage(err, 'Your message could not be removed') });
      }
    }
  },

  react: async (messageId, emoji) => {
    const me = useAuthStore.getState().user;
    const { activeId } = get();
    if (!me || !activeId) return;

    // Flip locally first — a reaction should feel instant.
    set((s) => ({
      messages: {
        ...s.messages,
        [activeId]: (s.messages[activeId] ?? []).map((m) => {
          if (m.id !== messageId) return m;
          const reactions = m.reactions ?? [];
          const mine = reactions.find((r) => r.userId === me.id && r.emoji === emoji);
          return {
            ...m,
            reactions: mine
              ? reactions.filter((r) => r !== mine)
              : [
                  ...reactions,
                  { id: `local:${emoji}`, emoji, userId: me.id, createdAt: new Date().toISOString() }
                ]
          };
        })
      }
    }));

    try {
      await emitAck(SocketEvents.MESSAGE_REACT, { messageId, emoji });
    } catch {
      try {
        await api.post(`/conversations/${activeId}/messages/${messageId}/reactions`, { emoji });
      } catch {
        // Roll back by re-reading the message from the server.
        const { data } = await api
          .get(`/conversations/${activeId}/messages?limit=50`)
          .catch(() => ({ data: null }) as never);
        if (data) set((s) => ({ messages: { ...s.messages, [activeId]: data.data } }));
      }
    }
  },

  togglePin: async (messageId, pinned) => {
    const { activeId } = get();
    if (!activeId) return;
    try {
      await emitAck(SocketEvents.MESSAGE_PIN, { messageId, pinned });
    } catch {
      await api
        .post(`/conversations/${activeId}/messages/${messageId}/pin`, { pinned })
        .catch(() => undefined);
    }
    void get().fetchPinned(activeId);
  },

  markRead: (channelId, messageId) => {
    const socket = getSocket();
    if (socket.connected) {
      socket.emit(SocketEvents.READ, { channelId, messageId });
    } else {
      void api.post(`/conversations/${channelId}/read`, { messageId }).catch(() => undefined);
    }
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === channelId ? { ...c, unreadCount: 0, mentionCount: 0 } : c
      )
    }));
  },

  setReplyTo: (message) => set({ replyTo: message, editing: null }),
  setEditing: (message) => set({ editing: message, replyTo: null }),

  setTyping: (channelId) => {
    getSocket().emit(SocketEvents.TYPING_START, { channelId });
  },

  clearError: () => set({ error: null }),

  // ---------------------------------------------------------------------------
  // Realtime
  // ---------------------------------------------------------------------------

  attachSocket: () => {
    const socket = getSocket();

    const onNew = ({ channelId, message }: { channelId: string; message: Message }) => {
      const me = useAuthStore.getState().user;
      const isActive = get().activeId === channelId;

      set((s) => {
        const existing = s.messages[channelId];
        return {
          // Only merge into a channel we already hold; otherwise the next open
          // fetches it fresh and we avoid caching a partial history.
          messages: existing
            ? { ...s.messages, [channelId]: mergeMessage(existing, message) }
            : s.messages,
          conversations: s.conversations.map((c) =>
            c.id === channelId
              ? {
                  ...c,
                  lastMessageAt: message.createdAt,
                  lastMessage: {
                    id: message.id,
                    channelId,
                    content: message.content,
                    type: message.type,
                    createdAt: message.createdAt,
                    userId: message.userId,
                    user: {
                      id: message.user?.id ?? message.userId,
                      displayName: message.user?.displayName ?? '',
                      username: message.user?.username ?? ''
                    },
                    attachments: (message.attachments ?? []).map((a) => ({
                      id: a.id,
                      mimeType: a.mimeType,
                      fileName: a.fileName
                    }))
                  },
                  unreadCount:
                    isActive || message.userId === me?.id ? 0 : (c.unreadCount ?? 0) + 1
                }
              : c
          ),
          typing: {
            ...s.typing,
            [channelId]: (s.typing[channelId] ?? []).filter((t) => t.userId !== message.userId)
          }
        };
      });

      if (isActive && message.userId !== me?.id) {
        get().markRead(channelId, message.id);
      }
    };

    const onUpdated = ({ channelId, message }: { channelId: string; message: Message }) => {
      set((s) =>
        s.messages[channelId]
          ? { messages: { ...s.messages, [channelId]: mergeMessage(s.messages[channelId], message) } }
          : s
      );
    };

    const onDeleted = ({ channelId, messageId }: { channelId: string; messageId: string }) => {
      set((s) => ({
        messages: s.messages[channelId]
          ? {
              ...s.messages,
              [channelId]: s.messages[channelId].map((m) =>
                m.id === messageId
                  ? { ...m, deletedAt: new Date().toISOString(), content: '', reactions: [] }
                  : m
              )
            }
          : s.messages
      }));
    };

    const onReaction = (data: {
      channelId: string;
      messageId: string;
      userId: string;
      emoji: string;
      action: 'add' | 'remove';
    }) => {
      const me = useAuthStore.getState().user;
      // Our own reactions were already applied optimistically.
      if (data.userId === me?.id) return;

      set((s) => ({
        messages: s.messages[data.channelId]
          ? {
              ...s.messages,
              [data.channelId]: s.messages[data.channelId].map((m) => {
                if (m.id !== data.messageId) return m;
                const reactions = m.reactions ?? [];
                return {
                  ...m,
                  reactions:
                    data.action === 'add'
                      ? [
                          ...reactions,
                          {
                            id: `${data.userId}:${data.emoji}`,
                            emoji: data.emoji,
                            userId: data.userId,
                            createdAt: new Date().toISOString()
                          }
                        ]
                      : reactions.filter(
                          (r) => !(r.userId === data.userId && r.emoji === data.emoji)
                        )
                };
              })
            }
          : s.messages
      }));
    };

    const onReadUpdated = (cursor: {
      channelId: string;
      userId: string;
      lastReadAt: string;
      lastReadMessageId: string | null;
    }) => {
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === cursor.channelId
            ? {
                ...c,
                members: c.members.map((m) =>
                  m.userId === cursor.userId
                    ? { ...m, lastReadAt: cursor.lastReadAt, lastReadMessageId: cursor.lastReadMessageId }
                    : m
                )
              }
            : c
        )
      }));
    };

    const onDelivered = (entry: { channelId: string; userId: string; lastDeliveredAt: string }) => {
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === entry.channelId
            ? {
                ...c,
                members: c.members.map((m) =>
                  m.userId === entry.userId ? { ...m, lastDeliveredAt: entry.lastDeliveredAt } : m
                )
              }
            : c
        )
      }));
    };

    const onTypingStart = (data: { channelId: string; userId: string; displayName: string }) => {
      set((s) => {
        const current = (s.typing[data.channelId] ?? []).filter((t) => t.userId !== data.userId);
        return {
          typing: {
            ...s.typing,
            [data.channelId]: [
              ...current,
              { userId: data.userId, displayName: data.displayName, expiresAt: Date.now() + TYPING_TTL }
            ]
          }
        };
      });
    };

    const onTypingStop = (data: { channelId: string; userId: string }) => {
      set((s) => ({
        typing: {
          ...s.typing,
          [data.channelId]: (s.typing[data.channelId] ?? []).filter((t) => t.userId !== data.userId)
        }
      }));
    };

    const onPresence = (data: { userId: string } & Record<string, unknown>) => {
      set((s) => ({
        conversations: s.conversations.map((c) => ({
          ...c,
          counterpart:
            c.counterpart?.id === data.userId
              ? { ...c.counterpart, ...(data as object) }
              : c.counterpart,
          members: c.members.map((m) =>
            m.userId === data.userId ? { ...m, user: { ...m.user, ...(data as object) } } : m
          )
        })),
        users: s.users.map((u) => (u.id === data.userId ? { ...u, ...(data as object) } : u))
      }));
    };

    const onConversationChanged = () => {
      void get().fetchConversations();
    };

    const onPinned = ({ channelId }: { channelId: string }) => {
      void get().fetchPinned(channelId);
    };

    // A reconnect may have missed events, so resync and drain the outbox.
    const onConnect = () => {
      void get().fetchConversations();
      const active = get().activeId;
      if (active) socket.emit(SocketEvents.CONVERSATION_SUBSCRIBE, { channelId: active });
      void get().flushOutbox();
    };

    socket.on('connect', onConnect);
    socket.on(SocketEvents.MESSAGE_NEW, onNew);
    socket.on(SocketEvents.MESSAGE_UPDATED, onUpdated);
    socket.on(SocketEvents.MESSAGE_DELETED, onDeleted);
    socket.on(SocketEvents.MESSAGE_REACTION, onReaction);
    socket.on(SocketEvents.MESSAGE_PINNED, onPinned);
    socket.on(SocketEvents.READ_UPDATED, onReadUpdated);
    socket.on(SocketEvents.DELIVERED_UPDATED, onDelivered);
    socket.on(SocketEvents.TYPING_START, onTypingStart);
    socket.on(SocketEvents.TYPING_STOP, onTypingStop);
    socket.on(SocketEvents.PRESENCE_CHANGED, onPresence);
    socket.on(SocketEvents.CONVERSATION_CREATED, onConversationChanged);
    socket.on(SocketEvents.CONVERSATION_UPDATED, onConversationChanged);
    socket.on(SocketEvents.CONVERSATION_DELETED, onConversationChanged);

    // Typing indicators expire on their own if a "stop" is ever lost.
    const sweeper = setInterval(() => {
      const now = Date.now();
      set((s) => {
        let changed = false;
        const next: Record<string, TypingEntry[]> = {};
        for (const [channelId, entries] of Object.entries(s.typing)) {
          const live = entries.filter((e) => e.expiresAt > now);
          if (live.length !== entries.length) changed = true;
          next[channelId] = live;
        }
        return changed ? { typing: next } : s;
      });
    }, 1500);

    return () => {
      clearInterval(sweeper);
      socket.off('connect', onConnect);
      socket.off(SocketEvents.MESSAGE_NEW, onNew);
      socket.off(SocketEvents.MESSAGE_UPDATED, onUpdated);
      socket.off(SocketEvents.MESSAGE_DELETED, onDeleted);
      socket.off(SocketEvents.MESSAGE_REACTION, onReaction);
      socket.off(SocketEvents.MESSAGE_PINNED, onPinned);
      socket.off(SocketEvents.READ_UPDATED, onReadUpdated);
      socket.off(SocketEvents.DELIVERED_UPDATED, onDelivered);
      socket.off(SocketEvents.TYPING_START, onTypingStart);
      socket.off(SocketEvents.TYPING_STOP, onTypingStop);
      socket.off(SocketEvents.PRESENCE_CHANGED, onPresence);
      socket.off(SocketEvents.CONVERSATION_CREATED, onConversationChanged);
      socket.off(SocketEvents.CONVERSATION_UPDATED, onConversationChanged);
      socket.off(SocketEvents.CONVERSATION_DELETED, onConversationChanged);
    };
  },

  /**
   * Derives the tick state for one of your own messages from the other
   * participants' read and delivery cursors — the same model WhatsApp uses,
   * and far cheaper than storing a receipt row per message per person.
   */
  deliveryStateOf: (message) => {
    if (isPending(message)) return message.failed ? 'failed' : 'pending';

    const me = useAuthStore.getState().user;
    if (!me || message.userId !== me.id) return 'sent';

    const conversation = get().conversations.find((c) => c.id === message.channelId);
    if (!conversation) return 'sent';

    const others = conversation.members.filter((m) => m.userId !== me.id);
    if (others.length === 0) return 'sent';

    const sentAt = new Date(message.createdAt).getTime();
    const seen = (value: string | null) => Boolean(value) && new Date(value!).getTime() >= sentAt;

    if (others.every((m) => seen(m.lastReadAt))) return 'read';
    if (others.every((m) => seen(m.lastDeliveredAt) || seen(m.lastReadAt))) return 'delivered';
    return 'sent';
  }
}));

/**
 * Attempts one delivery of an outbox item. Prefers the socket (single
 * round-trip, ack carries the saved row) and falls back to HTTP so a message
 * still sends while the realtime channel is reconnecting.
 */
async function deliver(
  item: OutboxItem,
  set: (fn: (s: ChatState) => Partial<ChatState>) => void,
  get: () => ChatState
) {
  const payload = {
    channelId: item.channelId,
    content: item.content,
    replyToId: item.replyToId,
    clientNonce: item.nonce,
    attachmentIds: item.attachmentIds
  };

  const settle = (message: Message) => {
    const outbox = get().outbox.filter((o) => o.nonce !== item.nonce);
    saveOutbox(outbox);
    set((s) => ({
      outbox,
      messages: {
        ...s.messages,
        [item.channelId]: mergeMessage(s.messages[item.channelId] ?? [], message)
      }
    }));
  };

  const markFailed = () => {
    const outbox = get().outbox.map((o) =>
      o.nonce === item.nonce ? { ...o, failed: true, attempts: o.attempts + 1 } : o
    );
    saveOutbox(outbox);
    set((s) => ({
      outbox,
      messages: {
        ...s.messages,
        [item.channelId]: (s.messages[item.channelId] ?? []).map((m) =>
          isPending(m) && m.nonce === item.nonce ? { ...m, failed: true } : m
        )
      }
    }));
  };

  try {
    const res = await emitAck<{ ok: boolean; message?: Message; error?: string }>(
      SocketEvents.MESSAGE_SEND,
      payload
    );
    if (res.ok && res.message) {
      settle(res.message);
      return;
    }
    throw new Error(res.error ?? 'Send failed');
  } catch {
    try {
      const { data } = await api.post(`/conversations/${item.channelId}/messages`, payload);
      settle(data.message);
    } catch {
      markFailed();
    }
  }
}
