"use client";

import { Component, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("App shell error boundary caught an error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-4 py-16">
          <div className="terminal-card w-full rounded-[28px] p-8 text-center">
            <p className="text-[0.65rem] uppercase tracking-[0.45em] text-violet-200/60">Rendering error</p>
            <h1 className="mt-4 text-3xl font-bold text-white">The AgentFi shell hit a runtime error.</h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              A visual component failed to render. Reload the page or return home to continue.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-full bg-violet-500 px-5 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
              >
                Reload
              </button>
              <a
                href="/"
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/5"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}