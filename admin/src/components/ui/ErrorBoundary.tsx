import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Sentry } from "../../lib/sentry";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * True when the error is a stale-deploy chunk failure: the user has an old tab
 * open, a new version was deployed, and the old hashed JS chunks no longer exist
 * on Vercel. The SPA fallback then serves index.html (text/html) for the missing
 * .js request, so the browser refuses to execute it. Reloading fetches the new
 * version and fixes it — this is not a real bug.
 */
export function isStaleChunkError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  const name = error instanceof Error ? error.name : "";
  return (
    name === "ChunkLoadError" ||
    msg.includes("not a valid javascript mime type") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk")
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Stale-chunk errors are expected after a deploy, not real bugs — don't spam Sentry.
    if (!isStaleChunkError(error)) {
      Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    }
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const stale = isStaleChunkError(this.state.error);

      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="text-center max-w-md">
            {stale ? (
              <>
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-text-primary mb-2">Uusi päivitys saatavilla</h2>
                <p className="text-sm text-text-secondary mb-4">
                  Sovelluksesta on julkaistu uusi versio. Lataa sivu uudelleen jatkaaksesi.
                </p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-text-primary mb-2">Jokin meni pieleen</h2>
                <p className="text-sm text-text-secondary mb-4">
                  {this.state.error?.message || "Odottamaton virhe tapahtui."}
                </p>
              </>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors"
            >
              Lataa sivu uudelleen
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
