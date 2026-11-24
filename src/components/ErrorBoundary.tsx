import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Une erreur inattendue est survenue.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] p-6">
          <div className="max-w-md w-full bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 space-y-4 text-center">
            <AlertTriangle
              className="w-8 h-8 mx-auto"
              style={{ color: 'var(--status-err)' }}
            />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Interruption momentanée
            </h2>
            <p className="text-xs text-[var(--text-secondary)] break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Recharger l’espace EVOLYS
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
