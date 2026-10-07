import { act, renderHook } from '@testing-library/react';
import * as monaco from 'monaco-editor';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMarkdownToolbar } from '../useMarkdownToolbar';

function createEditor(text: string, initialSelection: monaco.Selection) {
  const model = monaco.editor.createModel(text, 'markdown');
  let selection = initialSelection;
  const editor = {
    getModel: () => model,
    getSelection: () => selection,
    executeEdits: (_source: string, edits: monaco.editor.IIdentifiedSingleEditOperation[]) => {
      model.applyEdits(edits);
      return true;
    },
    setSelection: (next: monaco.Selection) => {
      selection = next;
    },
    setPosition: vi.fn(),
    revealRange: vi.fn(),
    hasTextFocus: () => true,
    focus: vi.fn(),
  };
  const { result, unmount } = renderHook(() =>
    useMarkdownToolbar({
      editorRef: { current: editor as unknown as monaco.editor.IStandaloneCodeEditor },
      monacoRef: { current: monaco },
    })
  );

  return {
    model,
    result,
    selectedText: () => model.getValueInRange(selection),
    dispose: () => {
      unmount();
      model.dispose();
    },
  };
}

describe('useMarkdownToolbar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each(['bold', 'italic'] as const)(
    'preserves only the inner multiline text after %s, so Link keeps the delimiters outside',
    action => {
      const editor = createEditor('Sales\nRevenue', new monaco.Selection(1, 1, 2, 8));
      const delimiter = action === 'bold' ? '**' : '*';
      try {
        act(() => {
          editor.result.current.applyAction(action);
        });
        expect(editor.selectedText()).toBe('Sales\nRevenue');

        act(() => {
          editor.result.current.applyAction('link');
        });
        expect(editor.model.getValue()).toBe(
          `${delimiter}[Sales\nRevenue](https://example.com)${delimiter}`
        );
      } finally {
        editor.dispose();
      }
    }
  );

  it.each(['bold', 'italic'] as const)('preserves the inner single-line text after %s', action => {
    const editor = createEditor('Before Sales after', new monaco.Selection(1, 8, 1, 13));
    const delimiter = action === 'bold' ? '**' : '*';
    try {
      act(() => {
        editor.result.current.applyAction(action);
      });
      expect(editor.selectedText()).toBe('Sales');
      act(() => {
        editor.result.current.applyAction('link');
      });
      expect(editor.model.getValue()).toBe(
        `Before ${delimiter}[Sales](https://example.com)${delimiter} after`
      );
    } finally {
      editor.dispose();
    }
  });

  it.each([
    [1, 8, 2, 8],
    [2, 8, 1, 8],
  ])(
    'preserves partial lines and surrounding text for selection (%i, %i) → (%i, %i)',
    (startLine, startColumn, endLine, endColumn) => {
      const editor = createEditor(
        'Before Sales\nRevenue after',
        new monaco.Selection(startLine, startColumn, endLine, endColumn)
      );
      try {
        act(() => {
          editor.result.current.applyAction('bold');
        });
        expect(editor.selectedText()).toBe('Sales\nRevenue');
        act(() => {
          editor.result.current.applyAction('link');
        });
        expect(editor.model.getValue()).toBe(
          'Before **[Sales\nRevenue](https://example.com)** after'
        );
      } finally {
        editor.dispose();
      }
    }
  );
});
