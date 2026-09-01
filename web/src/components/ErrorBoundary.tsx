import { Component, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches render-time errors anywhere below it and shows an on-brand fallback
 * instead of a blank white page. Recovering is a full reload — safe for a
 * local single-page console.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fatal">
          <div className="fatal-card">
            <div className="mark">AD</div>
            <h1>Something went wrong</h1>
            <p className="muted">
              The console hit an unexpected error while rendering. Your engagement data on disk is
              untouched. Reloading usually clears it.
            </p>
            <pre className="log">{this.state.error.message}</pre>
            <div className="actions">
              <button className="btn primary" type="button" onClick={() => window.location.reload()}>
                Reload console
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
