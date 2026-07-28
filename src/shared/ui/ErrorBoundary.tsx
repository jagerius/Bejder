tsx
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Error Boundary na poziomie całej aplikacji.
 * Łapie błędy renderowania (w tym awarie Three.js / WebGL)
 * i pokazuje ekran awaryjny zamiast białej strony.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#1a1a2e] text-white flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="text-6xl mb-4">💥</div>
            <h1 className="text-2xl font-bold mb-2">Coś poszło nie tak</h1>
            <p className="text-gray-400 text-sm mb-4">
              Aplikacja napotkała nieoczekiwany błąd. Twoje projekty są
              przechowywane lokalnie i nie zostały utracone.
            </p>
            {this.state.errorMessage && (
              <pre className="text-xs text-red-300 bg-red-900/30 rounded p-3 mb-4 overflow-auto max-h-32 text-left">
                {this.state.errorMessage}
              </pre>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-[#0f3460] hover:bg-[#1a4f8a] rounded-lg text-sm transition"
              >
                Spróbuj ponownie
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-[#e94560] hover:bg-[#c73652] rounded-lg text-sm font-semibold transition"
              >
                Przeładuj aplikację
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}