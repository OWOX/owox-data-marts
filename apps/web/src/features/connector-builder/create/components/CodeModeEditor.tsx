import { Editor } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { useBuilder } from '../../shared/model/hooks/useBuilder';
import { manifestToJson, parseManifestJson } from '../../shared/model/manifestJson';

export function CodeModeEditor() {
  const { manifest, setManifest } = useBuilder();
  const { resolvedTheme } = useTheme();
  const [text, setText] = useState<string>(() => manifestToJson(manifest));
  const [error, setError] = useState<string | null>(null);
  // The manifest object this editor last pushed. Compared by identity, not by value:
  // the reducer stores the very object handed to it, so "the context manifest is the one
  // we pushed" is exactly "this change came from typing here".
  const pushedRef = useRef(manifest);

  // Follow a manifest replaced from outside — opening a version from history, Discard
  // changes, an AI-authored manifest. Without this the buffer keeps the text it was
  // seeded with, and the next keystroke re-parses that stale text over the new manifest.
  // Reformatting mid-typing is avoided by the identity check rather than by comparing
  // serialized text, so the author's own spacing survives the round-trip.
  useEffect(() => {
    if (manifest === pushedRef.current) return;
    pushedRef.current = manifest;
    setText(manifestToJson(manifest));
    setError(null);
  }, [manifest]);

  const handleChange = (value: string | undefined) => {
    const next = value ?? '';
    setText(next);
    const res = parseManifestJson(next);
    if (res.ok) {
      setError(null);
      pushedRef.current = res.manifest;
      setManifest(res.manifest);
    } else {
      setError(res.error);
    }
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
