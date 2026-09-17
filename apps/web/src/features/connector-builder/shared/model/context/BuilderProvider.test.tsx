import { describe, it, expect } from 'vitest';
import { memo, useReducer } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BuilderProvider } from './BuilderProvider';
import { useBuilderContext } from './useBuilderContext';

describe('BuilderProvider', () => {
  it('keeps the context value stable across renders that changed no state', () => {
    let consumerRenders = 0;
    const Consumer = memo(function Consumer() {
      useBuilderContext();
      consumerRenders++;
      return null;
    });

    function Host() {
      const [, rerender] = useReducer((n: number) => n + 1, 0);
      return (
        <>
          <button type='button' onClick={rerender}>
            rerender
          </button>
          <BuilderProvider>
            <Consumer />
          </BuilderProvider>
        </>
      );
    }

    render(<Host />);
    const before = consumerRenders;
    fireEvent.click(screen.getByText('rerender'));
    // A fresh `{ state, dispatch }` on every provider render is a context change as far as
    // React is concerned, so every consumer in the builder re-renders for a render that
    // carries no new state at all.
    expect(consumerRenders).toBe(before);
  });
});
