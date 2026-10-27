import { useState } from 'react';
import { Editor } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useTheme } from 'next-themes';
import type { SqlDefinitionConfig } from '../../../model';
import {
  SqlDataMartReferencePicker,
  type SqlReferencesContext,
} from './SqlDataMartReferencePicker';

interface DataMartCodeEditorProps {
  value?: SqlDefinitionConfig;
  onChange: (config: SqlDefinitionConfig) => void;
  /** Lets the query reference other Data Marts of the same Storage via `@`. */
  references?: SqlReferencesContext;
}

/**
 * Fully controlled: the query lives in the form, never in a local mirror. A mirror lets the two
 * drift — the editor showing text the form no longer holds, or the form pushing a stale query back
 * over what is being typed — and the drift is invisible until a save writes the wrong thing.
 */
export function DataMartCodeEditor({ value, onChange, references }: DataMartCodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor | null>(null);

  function handleEditorChange(nextValue: string | undefined) {
    if (nextValue !== undefined) {
      onChange({ sqlQuery: nextValue });
    }
  }
  return (
    <div
      // `nokey` is React Flow's opt-out marker: its document-level key hooks skip events coming
      // from inside it. Monaco's EditContext input is a plain div that xyflow's is-input check
      // does not recognize, so without this a canvas elsewhere on the page (Joinable Data Marts
      // diagram) grabs keys like Space away from the editor.
      className='nokey resize-y overflow-auto rounded-md border border-gray-200 shadow-xs dark:border-gray-200/4'
      style={{ height: '30vh', minHeight: '240px' }}
    >
      <Editor
        className='h-full w-full'
        height='100%'
        language='sql'
        value={value?.sqlQuery ?? ''}
        onChange={handleEditorChange}
        onMount={mounted => {
          setEditor(mounted);
          mounted.onDidDispose(() => {
            setEditor(current => (current === mounted ? null : current));
          });
        }}
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
        options={{
          // The reference picker is a content widget; keep it from being clipped by this box.
          fixedOverflowWidgets: true,
          selectOnLineNumbers: true,
          hideCursorInOverviewRuler: true,
          minimap: {
            enabled: false,
          },
          scrollBeyondLastLine: false,
          overviewRulerBorder: false,
          automaticLayout: true,
        }}
      />
      {references && <SqlDataMartReferencePicker editor={editor} {...references} />}
    </div>
  );
}
