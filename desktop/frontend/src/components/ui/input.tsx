import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-8 w-full rounded-md border border-input/70 bg-background/60 px-2.5 text-xs',
          'transition-colors duration-100 ease-out placeholder:text-muted-foreground/50',
          'focus-visible:border-ring/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40',
          'disabled:cursor-not-allowed disabled:opacity-40',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
