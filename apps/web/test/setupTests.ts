import '@testing-library/jest-dom';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// jsdom ships no ResizeObserver; the cast reads the global as possibly-absent so
// the fallback is not treated as dead code.
const existing = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
globalThis.ResizeObserver = existing ?? (ResizeObserverStub as unknown as typeof ResizeObserver);
