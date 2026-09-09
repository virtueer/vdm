import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md',
    'font-medium transition-colors duration-100 ease-out',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-40',
    '[&_svg]:size-3.5 [&_svg]:shrink-0'
  ),
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive/15 text-destructive hover:bg-destructive/25',
        outline: 'border border-border/70 bg-transparent hover:bg-accent/50 hover:text-foreground',
        secondary: 'bg-muted/60 text-foreground hover:bg-muted',
        ghost: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        link: 'text-foreground underline-offset-2 hover:underline',
      },
      size: {
        default: 'h-8 px-3 text-xs',
        sm: 'h-7 px-2.5 text-xs',
        lg: 'h-9 px-4 text-sm [&_svg]:size-4',
        icon: 'h-8 w-8 [&_svg]:size-4',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
