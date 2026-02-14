import { Editor } from '@monaco-editor/react';
import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import type { SqlDefinitionConfig } from '../../../model';

interface DataMartCodeEditorProps {
  initialValue?: SqlDefinitionConfig;
  onChange: (config: SqlDefinitionConfig) => void;
}

export function DataMartCodeEditor({ initialValue, onChange }: DataMartCodeEditorProps) {
  const [sqlCode, setSqlCode] = useState<string>(initialValue?.sqlQuery ?? '');
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (initialValue?.sqlQuery && initialValue.sqlQuery !== sqlCode) {
      setSqlCode(initialValue.sqlQuery);
    }
  }, [initialValue, sqlCode]);

  function handleEditorChange(value: string | undefined) {
    if (value !== undefined) {
      setSqlCode(value);
      onChange({ sqlQuery: value });
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
        value={sqlCode}
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
