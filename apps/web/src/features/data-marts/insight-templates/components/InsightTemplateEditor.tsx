import type * as monacoEditor from 'monaco-editor';
import { Editor } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { registerTemplateSlashCommandProvider } from '../utils/monaco-template-commands.util';

interface InsightTemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  height?: string | number;
}

type Monaco = typeof monacoEditor;

export function InsightTemplateEditor({
  value,
  onChange,
  readOnly = false,
  height = '50vh',
}: InsightTemplateEditorProps) {
  const { resolvedTheme } = useTheme();

  const handleMount = (_editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    registerTemplateSlashCommandProvider(
      monaco as unknown as typeof import('monaco-editor'),
      'markdown'
    );
  };

  return (
    <Editor
      className='overflow-hidden rounded-tl-md'
      language='markdown'
      value={value}
      onChange={v => {
        onChange(v ?? '');
      }}
      onMount={handleMount}
      height={height}
      theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
      options={{
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        readOnly,
      }}
    />
  );
}
