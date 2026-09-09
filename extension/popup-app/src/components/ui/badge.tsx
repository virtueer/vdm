import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  cn(
    'inline-flex h-5 items-center gap-1 rounded-sm border px-1.5',
    'font-mono text-[10px] font-medium uppercase leading-none tracking-tight',
    'transition-colors duration-100 ease-out [&_svg]:size-3 [&_svg]:shrink-0'
  ),
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-border/60 bg-muted/50 text-muted-foreground',
        outline: 'border-border/70 text-muted-foreground',
        destructive: 'border-danger/25 bg-danger/10 text-danger',
        success: 'border-success/25 bg-success/10 text-success',
        warning: 'border-warning/25 bg-warning/10 text-warning',
        info: 'border-info/25 bg-info/10 text-info',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
