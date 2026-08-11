export type UserRole = 'admin' | 'member';
export type UserStatus = 'online' | 'away' | 'busy' | 'offline';
export type ConversationKind = 'channel' | 'dm' | 'group';
export type ChannelType = 'text' | 'voice' | 'announcement';
export type MessageType = 'text' | 'file' | 'voice' | 'system';
export type NotifyLevel = 'all' | 'mentions' | 'none';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  accentColor: string | null;
  title: string | null;
  role: UserRole;
  status: UserStatus;
  statusText: string | null;
  isConnected: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  placeholder: string | null;
}

export interface Reaction {
  id: string;
  emoji: string;
  userId: string;
  createdAt: string;
}

export interface MessageReference {
  id: string;
  content: string;
  type: MessageType;
  deletedAt: string | null;
  createdAt: string;
  user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
}

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  type: MessageType;
  replyToId: string | null;
  clientNonce: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  pinnedAt: string | null;
  pinnedById: string | null;
  createdAt: string;
  user?: User;
  reactions?: Reaction[];
  attachments?: Attachment[];
  replyTo?: MessageReference | null;
  pinnedBy?: { id: string; displayName: string } | null;
  _count?: { replies: number };
}

export interface ConversationMember {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  lastReadAt: string | null;
  lastReadMessageId: string | null;
  lastDeliveredAt: string | null;
  user: User;
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  name: string;
  slug: string | null;
  description: string | null;
  topic: string | null;
  type: ChannelType;
  icon: string | null;
  isPrivate: boolean;
  isArchived: boolean;
  position: number;
  parentId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  /** The other participant, for direct messages only. */
  counterpart: User | null;
  isMember: boolean;
  isFavorite: boolean;
  notifyLevel: NotifyLevel;
  mutedUntil: string | null;
  myRole: string | null;
  lastReadAt: string | null;
  lastReadMessageId: string | null;
  messageCount: number;
  memberCount: number;
  members: ConversationMember[];
  unreadCount: number;
  mentionCount: number;
  lastMessage: {
    id: string;
    channelId: string;
    content: string;
    type: MessageType;
    createdAt: string;
    userId: string;
    user: { id: string; displayName: string; username: string };
    attachments: Array<{ id: string; mimeType: string; fileName: string }>;
  } | null;
}

/** What the ticks next to your own message mean. */
export type DeliveryState = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface CursorPage<T> {
  data: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface SearchHit extends Message {
  channel: { id: string; name: string; kind: ConversationKind; slug: string | null };
}
