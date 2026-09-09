import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Last-resort guard: a render crash should not leave a blank window. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <h1 className="text-sm font-semibold tracking-tight">Arayüz beklenmedik bir hata verdi</h1>
        <pre className="max-w-[520px] select-text overflow-auto rounded-md border border-border/40 bg-muted/20 p-2.5 text-left font-mono text-[10px] leading-relaxed text-muted-foreground">
          {error.message}
        </pre>
        <Button variant="outline" onClick={() => this.setState({ error: null })}>
          Yeniden dene
        </Button>
      </div>
    );
  }
}
