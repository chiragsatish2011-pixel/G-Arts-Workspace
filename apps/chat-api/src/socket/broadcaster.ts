import type { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export const room = (channelId: string) => `channel:${channelId}`;
export const userRoom = (userId: string) => `user:${userId}`;

export function setSocketServer(server: SocketIOServer): void {
  io = server;
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}

/** Fan an event out to everyone currently subscribed to a conversation. */
export function broadcastToChannel(channelId: string, event: string, payload: unknown): void {
  io?.to(room(channelId)).emit(event, payload);
}

/** Fan an event out to every device belonging to one member. */
export function broadcastToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}

export function broadcastToUsers(userIds: string[], event: string, payload: unknown): void {
  if (userIds.length === 0) return;
  io?.to(userIds.map(userRoom)).emit(event, payload);
}

/**
 * Makes every live socket for a member join a room. Used when someone is added
 * to a channel so they start receiving it immediately, without a reconnect.
 */
export async function subscribeUserToChannel(userId: string, channelId: string): Promise<void> {
  if (!io) return;
  const sockets = await io.in(userRoom(userId)).fetchSockets();
  for (const socket of sockets) socket.join(room(channelId));
}

export async function unsubscribeUserFromChannel(userId: string, channelId: string): Promise<void> {
  if (!io) return;
  const sockets = await io.in(userRoom(userId)).fetchSockets();
  for (const socket of sockets) socket.leave(room(channelId));
}
