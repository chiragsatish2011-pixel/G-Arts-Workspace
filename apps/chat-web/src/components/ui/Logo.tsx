import { cn } from '@g-arts/chat-shared';

/**
 * The school's own marks, served from /public rather than redrawn, so the
 * branding here stays identical to gurukul.org.
 *
 *   gurukul-monogram.svg — square emblem, used for the app mark and favicon
 *   gurukul-wordmark.svg — full "Shree Swaminarayan Gurukul" lockup
 */

export function Monogram({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/gurukul-monogram.svg"
      alt="Gurukul"
      width={size}
      height={size}
      draggable={false}
      className={cn('drag-none select-none object-contain', className)}
    />
  );
}

export function Wordmark({ className, height = 34 }: { className?: string; height?: number }) {
  return (
    <img
      src="/gurukul-wordmark.svg"
      alt="Shree Swaminarayan Gurukul"
      height={height}
      style={{ height }}
      draggable={false}
      className={cn('drag-none w-auto select-none object-contain', className)}
    />
  );
}
