import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Without this, any render-time exception unmounts the whole tree and leaves a
 * blank page with nothing to act on — which is exactly what a stray conditional
 * hook did. A crash should always say what happened and offer a way out.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Gurukul Chat crashed while rendering:', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private hardReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-6">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-float">
          <h1 className="font-display text-lg font-semibold text-ink">Something went wrong</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
            The app hit an unexpected error while drawing this screen. Your messages are safe on the
            server.
          </p>

          <pre className="scroll-slim mt-4 max-h-40 overflow-auto rounded-xl bg-sunken p-3 font-mono text-[11.5px] leading-relaxed text-ink-soft">
            {error.message || String(error)}
          </pre>

          <div className="mt-5 flex gap-2">
            <button
              onClick={this.hardReload}
              className="h-10 flex-1 rounded-xl bg-brand text-sm font-medium text-white transition-colors hover:bg-brand-deep"
            >
              Reload
            </button>
            <button
              onClick={this.reset}
              className="h-10 rounded-xl border border-line px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-sunken"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
