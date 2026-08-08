import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "@/i18n/i18n";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Rendering errors are intentionally not exposed to users. Runtime logging
    // is handled by the API/client observability integration when configured.
  }

  render(): ReactNode {
    if (this.state.failed) {
      return <div className="flex min-h-screen items-center justify-center p-6"><div className="max-w-md space-y-3 text-center"><h1 className="text-lg font-semibold">{i18n.t("common:status.error")}</h1><p className="text-sm text-muted-foreground">{i18n.t("common:status.unexpectedError")}</p><button className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => window.location.reload()}>{i18n.t("common:actions.reload")}</button></div></div>;
    }
    return this.props.children;
  }
}
