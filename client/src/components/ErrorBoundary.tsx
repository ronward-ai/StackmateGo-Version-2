import { Component, ReactNode } from 'react';
import { isDebugEnabled, formatErrorReport, reportToOverlay } from '@/lib/debugOverlay';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
  error?: Error;
  componentStack?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
    this.setState({ componentStack: info?.componentStack });
    // Mirror into the debug overlay so one "Copy all" grabs everything,
    // including any earlier window.onerror / rejection reports.
    if (isDebugEnabled()) {
      reportToOverlay(formatErrorReport('React ErrorBoundary', error, info?.componentStack));
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="text-center space-y-3 max-w-sm">
            <p className="text-destructive font-semibold text-lg">Something went wrong</p>
            <p className="text-sm text-muted-foreground font-mono bg-muted/30 p-2 rounded">
              {this.state.error?.message || 'Unknown error'}
            </p>
            {isDebugEnabled() && (
              <pre className="text-[10px] leading-relaxed text-left text-muted-foreground font-mono bg-muted/30 p-2 rounded max-h-[50vh] overflow-auto whitespace-pre-wrap break-words select-text">
                {formatErrorReport(
                  'React ErrorBoundary',
                  this.state.error,
                  this.state.componentStack,
                )}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
