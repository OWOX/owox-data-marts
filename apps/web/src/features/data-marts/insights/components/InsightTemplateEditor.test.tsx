import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InsightTemplateEditor } from './InsightTemplateEditor';

const mocks = vi.hoisted(() => ({
  executeEdits: vi.fn(),
  trigger: vi.fn(),
  selection: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
  registerProvider: vi.fn(() => vi.fn()),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('../utils/monaco-template-commands.util', () => ({
  registerTemplateSlashCommandProvider: mocks.registerProvider,
}));
vi.mock('@monaco-editor/react', () => ({
  Editor: function MockEditor({
    onMount,
  }: {
    onMount: (editor: unknown, monaco: unknown) => void;
  }) {
    useEffect(() => {
      onMount(
        {
          getModel: () => ({}),
          getPosition: () => ({ lineNumber: 1, column: 1 }),
          getSelection: () => mocks.selection,
          executeEdits: mocks.executeEdits,
          trigger: mocks.trigger,
          focus: vi.fn(),
          onDidDispose: vi.fn(),
          onDidChangeCursorPosition: vi.fn(),
        },
        {}
      );
    }, [onMount]);
    return <div>Template editor</div>;
  },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('InsightTemplateEditor template commands', () => {
  it('keeps the slash button and provider in Insights alongside shared Markdown formatting', () => {
    vi.useFakeTimers();
    render(<InsightTemplateEditor value='' onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(mocks.registerProvider).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Slash commands' }));
    expect(mocks.executeEdits).toHaveBeenCalledWith('template-command', [
      { range: mocks.selection, text: '/', forceMoveMarkers: true },
    ]);
    vi.advanceTimersByTime(50);
    expect(mocks.trigger).toHaveBeenCalledWith('keyboard', 'editor.action.triggerSuggest', {});
  });

  it('disables the template command and formatting in a read only Insight', () => {
    render(<InsightTemplateEditor value='' readOnly onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
    const command = screen.getByRole('button', { name: 'Slash commands' });
    expect(command).toBeDisabled();
    fireEvent.click(command);
    expect(mocks.executeEdits).not.toHaveBeenCalled();
  });
});
