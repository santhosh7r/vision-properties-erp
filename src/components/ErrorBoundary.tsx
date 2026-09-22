"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientError } from "@/lib/errors/report-client";
import ErrorNotice from "./ErrorNotice";
import { classifyError } from "@/lib/errors/classify";

// ---------------------------------------------------------------------------
// A boundary for one PIECE of a page, where a route-level boundary would be too
// blunt — a chart, a table, a widget that can fail on its own without the rest
// of the screen being worthless.
//
// Next.js's error.tsx files handle whole segments; this handles the inside of
// one. Wrap anything that renders data it does not fully control:
//
//   <ErrorBoundary subject="chart">
//     <RevenueChart data={data} />
//   </ErrorBoundary>
//
// Same contract as everywhere else: the error goes to the reporter, the user
// gets a sentence and a reference. A class component because `componentDidCatch`
// has no hook equivalent.
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode;
  /** The thing that failed, for the message: "This chart could not be loaded." */
  subject?: string;
  /** Replaces the default notice entirely. */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
  reference: string | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reference: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const reference = reportClientError(error, {
      componentStack: info.componentStack ?? null,
      context: { boundary: "component", subject: this.props.subject ?? null },
    });
    this.setState({ reference });
  }

  private reset = () => this.setState({ error: null, reference: null });

  render(): ReactNode {
    const { error, reference } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <ErrorNotice
        kind={classifyError(error).kind}
        reference={reference}
        subject={this.props.subject}
        action="loaded"
      >
        <button type="button" className="btn-ghost" onClick={this.reset}>
          Try again
        </button>
      </ErrorNotice>
    );
  }
}
