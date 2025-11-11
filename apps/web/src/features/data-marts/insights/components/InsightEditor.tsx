import { Editor } from '@monaco-editor/react';
import { useTheme } from 'next-themes';

interface InsightEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string | number;
  placeholder?: string;
  className?: string;
}

export function InsightEditor({ value, onChange, height = '60vh', className }: InsightEditorProps) {
  const { resolvedTheme } = useTheme();

  return (
    <div className={className}>
      <Editor
        height={height}
        language='markdown'
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
        value={value}
        onChange={v => onChange(v ?? '')}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          overviewRulerBorder: false,
          automaticLayout: true,
          overviewRulerLanes: 0,
        }}
      />
    </div>
  );
}

export default InsightEditor;
