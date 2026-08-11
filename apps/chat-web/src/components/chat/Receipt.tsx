import { motion } from 'framer-motion';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import type { DeliveryState } from '@g-arts/chat-shared';
import { cn } from '@g-arts/chat-shared';
import { Tooltip } from '../ui';

const LABEL: Record<DeliveryState, string> = {
  pending: 'Sending…',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Not sent — tap to retry'
};

/**
 * Sent / delivered / read ticks, driven by the other participants' cursors.
 * Blue-equivalent (jade) only once *everyone* else has read it, which is what
 * makes the indicator meaningful in a group.
 */
export function Receipt({
  state,
  className,
  onRetry
}: {
  state: DeliveryState;
  className?: string;
  onRetry?: () => void;
}) {
  const icon = {
    pending: <Clock size={13} strokeWidth={2.4} />,
    sent: <Check size={14} strokeWidth={2.6} />,
    delivered: <CheckCheck size={14} strokeWidth={2.6} />,
    read: <CheckCheck size={14} strokeWidth={2.6} />,
    failed: <AlertCircle size={13} strokeWidth={2.4} />
  }[state];

  const tone = {
    pending: 'opacity-55',
    sent: 'opacity-75',
    delivered: 'opacity-85',
    read: 'text-jade opacity-100',
    failed: 'text-danger opacity-100'
  }[state];

  const content = (
    <motion.span
      key={state}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      className={cn('inline-flex items-center', tone, className)}
    >
      {icon}
    </motion.span>
  );

  if (state === 'failed' && onRetry) {
    return (
      <button type="button" onClick={onRetry} aria-label={LABEL.failed}>
        <Tooltip label={LABEL.failed}>{content}</Tooltip>
      </button>
    );
  }

  return <Tooltip label={LABEL[state]}>{content}</Tooltip>;
}
