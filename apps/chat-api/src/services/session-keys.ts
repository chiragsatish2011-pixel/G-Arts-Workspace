/** Redis key layout, kept in one place so nothing drifts. */

export const sessionKey = (sessionId: string) => `session:${sessionId}`;
export const userSessionsKey = (userId: string) => `user:sessions:${userId}`;
export const presenceKey = (userId: string) => `presence:${userId}`;
export const loginAttemptsKey = (identifier: string) => `throttle:login:${identifier}`;
