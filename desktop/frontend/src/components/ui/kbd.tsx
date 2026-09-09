import * as React from 'react';
import { cn } from '@/lib/utils';

/** Compact shortcut hint, e.g. <Kbd>⌘K</Kbd> */
const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        'inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-sm px-1',
        'border border-border/60 bg-muted/40 font-mono text-[10px] leading-none',
        'tracking-tight text-muted-foreground/80',
        className
      )}
      {...props}
    />
  )
);
Kbd.displayName = 'Kbd';

/** Chip styling for a <Kbd> that sits on a filled (primary) button. */
export const kbdOnPrimary = cn(
  'border-primary-foreground/20 bg-primary-foreground/10',
  'text-primary-foreground/60'
);

export { Kbd };
