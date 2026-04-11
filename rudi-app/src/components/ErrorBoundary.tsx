import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — catches Three.js / rendering crashes gracefully.
 * Prevents a shader error from taking down the entire Rudi UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ERROR BOUNDARY]', error, info);
    // Persist to error log via IPC if available
    if (window.electronAPI) {
      (window.electronAPI as any).appendLog?.('errors', 'ErrorBoundary', error.message);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4 p-8">
          <div className="w-16 h-16 rounded-full border border-red-500/40 bg-red-500/10 flex items-center justify-center text-red-400 text-2xl">
            ⚠
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-white/80 mb-2 tracking-wide">Rendering Fault Detected</h2>
            <p className="text-sm text-white/40 italic mb-1">
              "My apologies, Sir. The render protocols have encountered a critical fault."
            </p>
            <code className="text-[10px] text-red-400/70 font-mono block mt-3 bg-red-900/20 border border-red-500/20 rounded p-2 max-w-sm break-words">
              {this.state.error?.message}
            </code>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 px-5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-sm transition"
          >
            Attempt Recovery
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
