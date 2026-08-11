import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface TokenPayload {
  userId: string;
  username: string;
  role: string;
  /**
   * Session id the access token was minted from. Revoking a single device
   * invalidates its access tokens without touching the member's other logins.
   */
  sid: string;
}

export interface VerifiedToken extends TokenPayload {
  /** Unix seconds. Used to expire long-lived sockets mid-connection. */
  exp: number;
  iat: number;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessTtl,
    issuer: 'garts-chat',
    audience: 'garts-client'
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): VerifiedToken | null {
  try {
    return jwt.verify(token, config.jwt.secret, {
      issuer: 'garts-chat',
      audience: 'garts-client'
    }) as VerifiedToken;
  } catch {
    return null;
  }
}
