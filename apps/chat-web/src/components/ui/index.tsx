import {
  forwardRef,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, getInitials, colorFromString } from '@g-arts/chat-shared';
import { X } from 'lucide-react';
import { mediaUrl, isAttachmentId } from '../../lib/media';

// ---------------------------------------------------------------------------
// Motion presets — one place, so timing feels consistent across the app.
// ---------------------------------------------------------------------------

export const spring = { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.7 };
export const softSpring = { type: 'spring' as const, stiffness: 260, damping: 30 };

export const popIn = {
  initial: { opacity: 0, scale: 0.95, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 4 },
  transition: spring
};

export const slideUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: softSpring
};

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-deep shadow-card active:shadow-none disabled:bg-brand/40',
  ghost: 'text-ink-soft hover:text-ink hover:bg-sunken',
  subtle: 'bg-sunken text-ink hover:bg-line-soft',
  outline: 'border border-line text-ink hover:bg-sunken',
  danger: 'bg-danger text-white hover:brightness-110'
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg'
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium select-none',
        'transition-[background-color,color,box-shadow,transform] duration-150 ease-spring',
        'active:scale-[0.97] disabled:opacity-55 disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? <Spinner size="sm" className="text-current" /> : children}
    </button>
  )
);
Button.displayName = 'Button';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, icon, className, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-[13px] font-medium text-ink-soft mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(error)}
            className={cn(
              'w-full h-11 rounded-xl bg-sunken border text-sm text-ink placeholder:text-ink-faint',
              'transition-colors duration-150 focus:outline-none focus:bg-surface',
              icon ? 'pl-10 pr-3' : 'px-3.5',
              error ? 'border-danger focus:border-danger' : 'border-line focus:border-brand',
              className
            )}
            {...props}
          />
        </div>
        <AnimatePresence>
          {(error || hint) && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={cn('text-xs mt-1.5', error ? 'text-danger' : 'text-ink-faint')}
            >
              {error ?? hint}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  }
);
Input.displayName = 'Input';

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

export function Spinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const px = { sm: 14, md: 20, lg: 30 }[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin text-brand', className)}
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  accent?: string | null;
  online?: boolean;
  status?: string | null;
  ring?: boolean;
  className?: string;
}

const AVATAR_SIZE = {
  xs: 'h-6 w-6 text-[9px]',
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl'
};

const DOT_SIZE = {
  xs: 'h-2 w-2 -bottom-0 -right-0',
  sm: 'h-2.5 w-2.5 -bottom-0.5 -right-0.5',
  md: 'h-3 w-3 -bottom-0.5 -right-0.5',
  lg: 'h-3.5 w-3.5 bottom-0 right-0',
  xl: 'h-5 w-5 bottom-0.5 right-0.5'
};

const STATUS_COLOR: Record<string, string> = {
  online: 'bg-jade',
  away: 'bg-gold',
  busy: 'bg-danger',
  offline: 'bg-ink-faint'
};

export function Avatar({
  name,
  src,
  size = 'md',
  accent,
  online,
  status,
  ring,
  className
}: AvatarProps) {
  const background = accent ?? colorFromString(name);
  const dot = online === false ? 'offline' : (status ?? (online ? 'online' : 'offline'));
  const resolved = useResolvedAvatar(src);

  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        className={cn(
          'rounded-full grid place-items-center font-semibold text-white overflow-hidden drag-none',
          AVATAR_SIZE[size],
          ring && 'ring-2 ring-brand ring-offset-2 ring-offset-surface'
        )}
        style={resolved ? undefined : { backgroundColor: background }}
      >
        {resolved ? (
          <img src={resolved} alt={name} className="h-full w-full object-cover" draggable={false} />
        ) : (
          <span className="tracking-wide">{getInitials(name)}</span>
        )}
      </div>
      {online !== undefined && (
        <span
          className={cn(
            'absolute rounded-full border-2 border-surface',
            DOT_SIZE[size],
            STATUS_COLOR[dot] ?? 'bg-ink-faint'
          )}
          title={dot}
        >
          {dot === 'online' && (
            <span className="absolute inset-0 rounded-full bg-jade animate-pulse-ring" />
          )}
        </span>
      )}
    </div>
  );
}

/**
 * Profile pictures are stored as an attachment id, not a public URL, so they
 * have to be fetched with the member's token before they can be displayed.
 */
export function useResolvedAvatar(src: string | null | undefined): string | null {
  const direct = src && !isAttachmentId(src) ? src : null;
  const [resolved, setResolved] = useState<string | null>(direct);

  useEffect(() => {
    if (!src) {
      setResolved(null);
      return;
    }
    if (!isAttachmentId(src)) {
      setResolved(src);
      return;
    }
    let active = true;
    setResolved(null);
    mediaUrl(src)
      .then((url) => active && setResolved(url))
      .catch(() => active && setResolved(null));
    return () => {
      active = false;
    };
  }, [src]);

  return resolved;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  width?: string;
}

export function Modal({ open, onClose, title, description, children, width = 'max-w-lg' }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-[3px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={spring}
            className={cn(
              'relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop',
              width
            )}
          >
            {title && (
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line-soft px-5 pb-3 pt-5">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
                  {description && <p className="text-[13px] text-ink-soft mt-1">{description}</p>}
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                  <X size={17} />
                </Button>
              </div>
            )}
            {/* Body scrolls, so the actions at its foot are always reachable. */}
            <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Tooltip — CSS-only, so it costs nothing on the hot message path.
// ---------------------------------------------------------------------------

export function Tooltip({
  label,
  children,
  side = 'top'
}: {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const position = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5'
  }[side];

  return (
    <span className="relative inline-flex group/tip">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-md px-2 py-1',
          'bg-ink text-canvas text-[11px] font-medium shadow-float',
          'opacity-0 scale-95 transition-all duration-150 ease-spring',
          'group-hover/tip:opacity-100 group-hover/tip:scale-100',
          position
        )}
      >
        {label}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export function Badge({
  count,
  accent = false,
  className
}: {
  count: number;
  accent?: boolean;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <motion.span
      key={count}
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: [0.5, 1.18, 1], opacity: 1 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'min-w-[20px] h-5 px-1.5 rounded-full grid place-items-center tabular',
        'text-[11px] font-bold leading-none',
        accent ? 'bg-brand text-white' : 'bg-ink-faint/25 text-ink-soft',
        className
      )}
    >
      {count > 99 ? '99+' : count}
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  body,
  action
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <motion.div {...slideUp} className="text-center max-w-sm mx-auto px-6">
      <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-brand-soft text-brand grid place-items-center">
        {icon}
      </div>
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      <p className="text-[13px] text-ink-soft mt-1.5 leading-relaxed">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}
