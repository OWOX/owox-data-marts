import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BuilderProvider } from '../../shared/model/context/BuilderProvider';
import { useBuilder } from '../../shared/model/hooks/useBuilder';
import { CodeModeEditor } from './CodeModeEditor';

vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value, onChange }: { value: string; onChange: (v: string | undefined) => void }) => (
    <textarea
      data-testid='monaco'
      value={value}
      onChange={e => {
        onChange(e.target.value);
      }}
    />
  ),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));

function Probe() {
  const { manifest, state, setManifest } = useBuilder();
  return (
    <>
      <div data-testid='probe'>{`${Object.keys(manifest.nodes).join(',')}|${String(state.dirty)}`}</div>
      {/* Stands in for every path that replaces the manifest under a mounted Code mode:
          opening a version from history, Discard changes, or an AI-authored manifest. */}
      <button
        type='button'
        data-testid='external-load'
        onClick={() => {
          setManifest({
            version: '1.0',
            name: 'Loaded',
            baseUrl: 'https://loaded.example.com',
            parameters: {},
            nodes: {
              loaded: {
                request: { method: 'GET', path: '' },
                recordSelector: { recordPath: [] },
                fields: {},
              },
            },
          });
        }}
      >
        load
      </button>
    </>
  );
}

function setup() {
  render(
    <BuilderProvider>
      <CodeModeEditor />
      <Probe />
    </BuilderProvider>
  );
}

const nodeJson = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: '1.0',
    name: '',
    baseUrl: '',
    parameters: {},
    nodes: {
      items: {
        request: { method: 'GET', path: '' },
        recordSelector: { recordPath: [] },
        fields: {},
      },
    },
    ...extra,
  });

describe('CodeModeEditor', () => {
  it('seeds the editor with the current manifest as JSON', () => {
    setup();
    const ta = screen.getByTestId<HTMLTextAreaElement>('monaco');
    expect(ta.value).toContain('"version": "1.0"');
    expect(ta.value).toContain('"nodes": {}');
  });

  it('applies a valid JSON edit to the manifest and marks dirty', () => {
    setup();
    fireEvent.change(screen.getByTestId('monaco'), { target: { value: nodeJson() } });
    expect(screen.getByTestId('probe')).toHaveTextContent('items|true');
    expect(screen.queryByTestId('code-error')).not.toBeInTheDocument();
  });

  it('shows an error and keeps the manifest on invalid JSON', () => {
    setup();
    fireEvent.change(screen.getByTestId('monaco'), { target: { value: nodeJson() } });
    expect(screen.getByTestId('probe')).toHaveTextContent('items|true');
    fireEvent.change(screen.getByTestId('monaco'), { target: { value: '{ broken' } });
    expect(screen.getByTestId('code-error')).toBeInTheDocument();
    expect(screen.getByTestId('probe')).toHaveTextContent('items|true');
  });

  it('re-seeds the buffer when the manifest is replaced from outside the editor', () => {
    setup();
    fireEvent.click(screen.getByTestId('external-load'));
    expect(screen.getByTestId<HTMLTextAreaElement>('monaco').value).toContain('"name": "Loaded"');
  });

  it('does not write a stale buffer back over an externally loaded manifest', () => {
    setup();
    fireEvent.click(screen.getByTestId('external-load'));
    // One keystroke: whatever the editor holds is re-parsed and applied. If the buffer
    // never followed the load, this silently restores the manifest the load replaced.
    const ta = screen.getByTestId<HTMLTextAreaElement>('monaco');
    fireEvent.change(ta, { target: { value: `${ta.value} ` } });
    expect(screen.getByTestId('probe')).toHaveTextContent('loaded|true');
  });

  it('keeps the text the author typed while it parses as valid JSON', () => {
    setup();
    // Two-space indentation is what manifestToJson emits; typing it differently must
    // survive the round-trip through the manifest and back.
    const typed = '{"version":"1.0","name":"Typed","baseUrl":"","parameters":{},"nodes":{}}';
    fireEvent.change(screen.getByTestId('monaco'), { target: { value: typed } });
    expect(screen.getByTestId<HTMLTextAreaElement>('monaco').value).toBe(typed);
  });
});
