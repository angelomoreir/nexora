import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../i18n";

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6 text-center">
        <div className="max-w-sm space-y-3">
          <p className="text-lg font-semibold text-foreground">{i18n.t("common.unexpectedError")}</p>
          <p className="text-sm text-muted-foreground">{i18n.t("common.tryAgain")}</p>
          <button
            type="button"
            className="nx-focus-ring rounded-md bg-primary px-4 py-2 text-sm font-medium text-white"
            onClick={() => window.location.reload()}
          >
            {i18n.t("common.refresh")}
          </button>
        </div>
      </div>
    );
  }
}
