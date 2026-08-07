import { Editor } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import type { SqlDefinitionConfig } from '../../../model';

interface DataMartCodeEditorProps {
  value?: SqlDefinitionConfig;
  onChange: (config: SqlDefinitionConfig) => void;
}

/**
 * Fully controlled: the query lives in the form, never in a local mirror. A mirror lets the two
 * drift — the editor showing text the form no longer holds, or the form pushing a stale query back
 * over what is being typed — and the drift is invisible until a save writes the wrong thing.
 */
export function DataMartCodeEditor({ value, onChange }: DataMartCodeEditorProps) {
  const { resolvedTheme } = useTheme();

  function handleEditorChange(nextValue: string | undefined) {
    if (nextValue !== undefined) {
      onChange({ sqlQuery: nextValue });
    }
  }
  return (
    <div
      className='resize-y overflow-auto rounded-md border border-gray-200 shadow-xs dark:border-gray-200/4'
      style={{ height: '30vh', minHeight: '240px' }}
    >
      <Editor
        className='h-full w-full'
        height='100%'
        language='sql'
        value={value?.sqlQuery ?? ''}
        onChange={handleEditorChange}
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
        options={{
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
    </div>
  );
}
