import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * What a screen shows when it has nothing to show.
 *
 * There were four treatments of this. One designed one — icon, title,
 * description, from the `.empty-state` classes — used exactly once; four
 * hand-rolled icon-and-paragraph variants that disagreed on padding (`py-8` vs
 * `py-10`), icon opacity (20%, 30%, none) and capitalisation; and three bare
 * one-line paragraphs. Several screens had none at all, so an empty container
 * simply looked broken.
 *
 * An empty state is one of the few places the app explains itself, so the body
 * takes the `body` step of the ramp rather than the 12px everything else was set
 * in, and it gets room to breathe.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  /** A lucide icon — the one icon system. */
  icon: LucideIcon;
  title: string;
  /** What this screen is for, and what to do about it being empty. */
  children?: React.ReactNode;
  /** The action that fills it, when there is one worth offering. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('empty-state', className)}>
      <div className="empty-state-icon">
        <Icon className="w-full h-full" strokeWidth={1.5} />
      </div>
      <div className="empty-state-title">{title}</div>
      {children && <div className="empty-state-description">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export default EmptyState;
