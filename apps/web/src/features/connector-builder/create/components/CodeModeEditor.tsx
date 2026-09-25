import { Editor } from '@monaco-editor/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { useBuilder } from '../../shared/model/hooks/useBuilder';
import { manifestToJson, parseManifestJson } from '../../shared/model/manifestJson';

/**
 * How long the buffer sits idle before a clean parse is pushed into builder state.
 *
 * The push is what re-renders every consumer of the builder context — the top bar, the
 * results dock, the nav rail — so doing it per character made typing cost a full tree
 * render each keystroke. A quarter second turns a burst of typing into one push, and is
 * short enough that nothing the author does next can outrun it (the switch to Builder mode
 * applies whatever is still owed on the way out).
 */
const APPLY_DEBOUNCE_MS = 250;

export function CodeModeEditor() {
  const { manifest, setManifest, setCodeInvalid } = useBuilder();
  const { resolvedTheme } = useTheme();
  const [text, setText] = useState<string>(() => manifestToJson(manifest));
  const [error, setError] = useState<string | null>(null);
  // The manifest object this editor last pushed. Compared by identity, not by value:
  // the reducer stores the very object handed to it, so "the context manifest is the one
  // we pushed" is exactly "this change came from typing here".
  const pushedRef = useRef(manifest);
  // The newest text that PARSED and has not been pushed yet, and the timer that will
  // push it. Refs because the timer and the unmount cleanup both outlive the render
  // that created them.
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const flush = useCallback(() => {
    cancelPending();
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending === null) return;
    const res = parseManifestJson(pending);
    if (!res.ok) return;
    pushedRef.current = res.manifest;
    setManifest(res.manifest);
  }, [cancelPending, setManifest]);

  // Unmounting is the switch to Builder mode, and it takes the buffer with it. Push
  // whatever the debounce still owes before that happens, or the last quarter second of
  // typing would be lost on every switch. Only a clean parse is pushed; an unparseable
  // buffer is what the switch guard has already put to the author.
  useEffect(() => flush, [flush]);

  // Follow a manifest replaced from outside — opening a version from history, Discard
  // changes, an AI-authored manifest. Without this the buffer keeps the text it was
  // seeded with, and the next keystroke re-parses that stale text over the new manifest.
  // Reformatting mid-typing is avoided by the identity check rather than by comparing
  // serialized text, so the author's own spacing survives the round-trip.
  useEffect(() => {
    if (manifest === pushedRef.current) return;
    pushedRef.current = manifest;
    // The load wins over half-typed text: drop the queued push instead of letting it
    // land on top of what was just loaded.
    cancelPending();
    pendingRef.current = null;
    setText(manifestToJson(manifest));
    setError(null);
    setCodeInvalid(false);
  }, [manifest, cancelPending, setCodeInvalid]);

  const handleChange = (value: string | undefined) => {
    const next = value ?? '';
    setText(next);
    // Parsed on every keystroke even though the push is debounced. The parse is cheap
    // next to a tree render, and it is what keeps "the buffer does not parse" exact for
    // the Save/Publish gate and the Builder-tab guard — a debounced answer would leave a
    // window in which both believe a half-typed buffer is safe.
    const res = parseManifestJson(next);
    setError(res.ok ? null : res.error);
    setCodeInvalid(!res.ok);
    // An unparseable keystroke leaves any queued clean parse alone: the last text that
    // parsed still belongs in the manifest, exactly as when every keystroke was pushed.
    if (!res.ok) return;
    pendingRef.current = next;
    cancelPending();
    timerRef.current = setTimeout(flush, APPLY_DEBOUNCE_MS);
  };

  return (
    <div className='flex h-full flex-col' data-testid='code-editor'>
      {error && (
        <div
          role='alert'
          className='border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'
          data-testid='code-error'
        >
          {error}
        </div>
      )}
      <div className='min-h-0 flex-1'>
        <Editor
          height='100%'
          language='json'
          value={text}
          onChange={handleChange}
          theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
}
