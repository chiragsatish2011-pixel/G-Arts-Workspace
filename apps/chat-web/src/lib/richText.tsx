import type { ReactNode } from 'react';

/**
 * A deliberately small inline formatter.
 *
 * Everything is produced as React elements from matched substrings — raw
 * message text is never turned into HTML, so there is no path from a message
 * to injected markup.
 */

interface Token {
  type: 'text' | 'code' | 'bold' | 'italic' | 'strike' | 'link' | 'mention' | 'emoji';
  value: string;
  href?: string;
}

const PATTERNS: Array<{ type: Token['type']; regex: RegExp }> = [
  { type: 'code', regex: /`([^`\n]+)`/ },
  { type: 'bold', regex: /\*\*([^*\n]+)\*\*/ },
  { type: 'italic', regex: /(?<![*\w])_([^_\n]+)_(?!\w)/ },
  { type: 'strike', regex: /~~([^~\n]+)~~/ },
  { type: 'link', regex: /\bhttps?:\/\/[^\s<>"')\]]+/ },
  { type: 'mention', regex: /(?<![\w/])@([a-z0-9._-]{2,32})/i }
];

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let rest = line;

  while (rest.length > 0) {
    let best: { index: number; length: number; token: Token } | null = null;

    for (const { type, regex } of PATTERNS) {
      const match = regex.exec(rest);
      if (!match) continue;
      if (best && match.index >= best.index) continue;

      best = {
        index: match.index,
        length: match[0].length,
        token:
          type === 'link'
            ? { type, value: match[0], href: match[0] }
            : { type, value: match[1] ?? match[0] }
      };
    }

    if (!best) {
      tokens.push({ type: 'text', value: rest });
      break;
    }

    if (best.index > 0) tokens.push({ type: 'text', value: rest.slice(0, best.index) });
    tokens.push(best.token);
    rest = rest.slice(best.index + best.length);
  }

  return tokens;
}

export interface RichTextProps {
  content: string;
  /** Usernames that should render as live mentions; others stay plain text. */
  knownUsernames?: Set<string>;
  currentUsername?: string;
  onMentionClick?: (username: string) => void;
}

export function RichText({
  content,
  knownUsernames,
  currentUsername,
  onMentionClick
}: RichTextProps) {
  const blocks = content.split(/```/);

  return (
    <>
      {blocks.map((block, blockIndex) => {
        // Odd indexes are the inside of a fenced code block.
        if (blockIndex % 2 === 1) {
          return (
            <pre
              key={blockIndex}
              className="my-1.5 overflow-x-auto rounded-lg bg-sunken border border-line px-3 py-2 font-mono text-[12.5px] leading-relaxed scroll-slim"
            >
              <code>{block.replace(/^\n/, '').replace(/\n$/, '')}</code>
            </pre>
          );
        }

        return (
          <span key={blockIndex}>
            {block.split('\n').map((line, lineIndex, lines) => (
              <span key={lineIndex}>
                {tokenizeLine(line).map((token, i) => (
                  <TokenView
                    key={i}
                    token={token}
                    knownUsernames={knownUsernames}
                    currentUsername={currentUsername}
                    onMentionClick={onMentionClick}
                  />
                ))}
                {lineIndex < lines.length - 1 && <br />}
              </span>
            ))}
          </span>
        );
      })}
    </>
  );
}

function TokenView({
  token,
  knownUsernames,
  currentUsername,
  onMentionClick
}: {
  token: Token;
  knownUsernames?: Set<string>;
  currentUsername?: string;
  onMentionClick?: (username: string) => void;
}): ReactNode {
  switch (token.type) {
    case 'code':
      return (
        <code className="rounded bg-ink/10 px-1.5 py-0.5 font-mono text-[0.85em]">
          {token.value}
        </code>
      );
    case 'bold':
      return <strong className="font-semibold">{token.value}</strong>;
    case 'italic':
      return <em className="italic">{token.value}</em>;
    case 'strike':
      return <s className="opacity-70">{token.value}</s>;
    case 'link':
      return (
        <a
          href={token.href}
          target="_blank"
          // noopener stops the opened page reaching back through window.opener.
          rel="noopener noreferrer nofollow"
          className="underline decoration-current/40 underline-offset-2 hover:decoration-current break-all"
        >
          {token.value.replace(/^https?:\/\//, '').slice(0, 64)}
          {token.value.length > 71 ? '…' : ''}
        </a>
      );
    case 'mention': {
      const handle = token.value.toLowerCase();
      const isEveryone = handle === 'everyone' || handle === 'channel' || handle === 'here';
      const known = isEveryone || knownUsernames?.has(handle);
      if (!known) return <>@{token.value}</>;

      const isMe = isEveryone || handle === currentUsername?.toLowerCase();
      return (
        <button
          type="button"
          onClick={() => !isEveryone && onMentionClick?.(handle)}
          className={
            isMe
              ? '-mx-0.5 rounded px-0.5 font-semibold text-brand bg-brand/12'
              : 'font-semibold text-brand/85 hover:text-brand transition-colors'
          }
        >
          @{token.value}
        </button>
      );
    }
    default:
      return <>{token.value}</>;
  }
}

/** True when a message is nothing but a handful of emoji — rendered oversized. */
export function isEmojiOnly(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 24) return false;
  const withoutEmoji = trimmed.replace(
    /[\p{Extended_Pictographic}\p{Emoji_Component}️‍\s]/gu,
    ''
  );
  return withoutEmoji.length === 0;
}
