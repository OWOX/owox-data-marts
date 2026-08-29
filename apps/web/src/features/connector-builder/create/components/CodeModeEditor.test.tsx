import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

let probeRenders = 0;

function Probe() {
  const { manifest, state, setManifest } = useBuilder();
  probeRenders++;
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

/** The editor next to a probe, with the editor mountable/unmountable on its own —
 * which is what the Builder/Code switch does to it. */
function Harness() {
  const [mounted, setMounted] = useState(true);
  return (
    <BuilderProvider>
      {mounted && <CodeModeEditor />}
      <button
        type='button'
        data-testid='unmount-editor'
        onClick={() => {
          setMounted(false);
        }}
      >
        unmount
      </button>
      <Probe />
    </BuilderProvider>
  );
}

function setup() {
  probeRenders = 0;
  render(<Harness />);
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

  it('applies a valid JSON edit to the manifest and marks dirty', async () => {
    setup();
    fireEvent.change(screen.getByTestId('monaco'), { target: { value: nodeJson() } });
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('items|true');
    });
    expect(screen.queryByTestId('code-error')).not.toBeInTheDocument();
  });

  it('shows an error and keeps the manifest on invalid JSON', async () => {
    setup();
    fireEvent.change(screen.getByTestId('monaco'), { target: { value: nodeJson() } });
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('items|true');
    });
    fireEvent.change(screen.getByTestId('monaco'), { target: { value: '{ broken' } });
    // Reported immediately, not on the debounce: it is what gates Save/Publish and the
    // switch back to the Builder tab.
    expect(screen.getByTestId('code-error')).toBeInTheDocument();
    expect(screen.getByTestId('probe')).toHaveTextContent('items|true');
  });

  it('re-seeds the buffer when the manifest is replaced from outside the editor', () => {
    setup();
    fireEvent.click(screen.getByTestId('external-load'));
    expect(screen.getByTestId<HTMLTextAreaElement>('monaco').value).toContain('"name": "Loaded"');
  });

  it('does not write a stale buffer back over an externally loaded manifest', async () => {
    setup();
    fireEvent.click(screen.getByTestId('external-load'));
    // One keystroke: whatever the editor holds is re-parsed and applied. If the buffer
    // never followed the load, this silently restores the manifest the load replaced.
    const ta = screen.getByTestId<HTMLTextAreaElement>('monaco');
    fireEvent.change(ta, { target: { value: `${ta.value} ` } });
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('loaded|true');
    });
  });

  it('pushes a burst of keystrokes into builder state once, not once per character', async () => {
    setup();
    const ta = screen.getByTestId('monaco');
    const before = probeRenders;

    // Three keystrokes with no idle time between them. Pushing each one re-renders every
    // consumer of the builder context — the top bar, the dock, the nav rail — per character.
    fireEvent.change(ta, { target: { value: nodeJson({ name: 'a' }) } });
    fireEvent.change(ta, { target: { value: nodeJson({ name: 'ab' }) } });
    fireEvent.change(ta, { target: { value: nodeJson({ name: 'abc' }) } });
    expect(probeRenders).toBe(before);

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('items|true');
    });
    expect(probeRenders - before).toBeLessThanOrEqual(2);
  });

  it('applies the last valid buffer when the editor unmounts mid-debounce', async () => {
    // Switching to the Builder tab unmounts this editor. The debounce must not turn that
    // into "everything typed in the last quarter second is gone".
    setup();
    fireEvent.change(screen.getByTestId('monaco'), { target: { value: nodeJson() } });
    fireEvent.click(screen.getByTestId('unmount-editor'));
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('items|');
    });
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
