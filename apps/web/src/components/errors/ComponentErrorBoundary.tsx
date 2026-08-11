import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ComponentErrorBoundaryProps {
  /** Names the failing region in the console log, e.g. `connector-builder node "items"`. */
  name: string;
  /** Rendered in place of `children` once a render throws. `retry` drops the caught error. */
  fallback: (error: Error, retry: () => void) => ReactNode;
  /**
   * Drop the caught error whenever any of these changes. Without it the boundary latches:
   * one bad input would keep every later, healthy one from ever rendering.
   */
  resetKeys?: readonly unknown[];
  children: ReactNode;
}

interface ComponentErrorBoundaryState {
  error: Error | null;
}

function keysChanged(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
  return a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
}

/**
 * Contains a render crash to one region of a page.
 *
 * `RootErrorBoundary` and `LayoutErrorBoundary` are react-router `errorElement`s: they
 * replace a whole route, which is the right blast radius for a failed loader but far too
 * wide for a single pane of an editor whose other panes are how the author would repair
 * the problem. This is the component-level counterpart. React offers only one mechanism
 * for that — a class with `getDerivedStateFromError` — so that is what this is.
 */
export class ComponentErrorBoundary extends Component<
  ComponentErrorBoundaryProps,
  ComponentErrorBoundaryState
> {
  state: ComponentErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ComponentErrorBoundaryState {
    if (error instanceof Error) return { error };
    return { error: new Error(typeof error === 'string' ? error : 'Unknown render error') };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ComponentError] ${this.props.name}`, error.message, info.componentStack);
  }

  componentDidUpdate(prev: ComponentErrorBoundaryProps): void {
    if (this.state.error && keysChanged(prev.resetKeys, this.props.resetKeys)) {
      this.retry();
    }
  }

  retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    return error ? this.props.fallback(error, this.retry) : this.props.children;
  }
}
