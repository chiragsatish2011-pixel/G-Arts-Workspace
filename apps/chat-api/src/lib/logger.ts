import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.logLevel,
  transport: config.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname'
        }
      },
  base: { service: 'gurukul-chat-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'passwordHash',
      '*.passwordHash',
      'refreshToken',
      '*.refreshToken',
      'accessToken',
      '*.accessToken'
    ],
    censor: '[redacted]'
  }
});
