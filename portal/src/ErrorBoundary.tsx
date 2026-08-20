import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { message: string | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: Error): State {
    return { message: error.message || 'Something went wrong.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('packproof_portal_error', { message: error.message, componentStack: info.componentStack });
  }

  render(): ReactNode {
    if (this.state.message) {
      return (
        <main className="main">
          <p className="eyebrow">PackProof</p>
          <h1>This screen could not be shown</h1>
          <p className="lede">{this.state.message}</p>
        </main>
      );
    }
    return this.props.children;
  }
}
