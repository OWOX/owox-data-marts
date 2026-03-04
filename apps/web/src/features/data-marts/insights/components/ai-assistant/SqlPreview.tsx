import { useState } from 'react';
import { Editor } from '@monaco-editor/react';
import { useTheme } from 'next-themes';

export function SqlPreview({ sql }: { sql: string }) {
  const { resolvedTheme } = useTheme();
  const [height, setHeight] = useState<number>(() => {
    const lines = (sql.match(/\n/g) ?? []).length + 1;
    return Math.min(Math.max(lines * 19 + 16, 40), 300);
  });

  return (
    <div className='border-border overflow-hidden rounded-md border'>
      <Editor
        language='sql'
        value={sql}
        height={height}
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
        loading={null}
        onMount={editor => {
          const contentHeight = Math.min(editor.getContentHeight(), 300);
          setHeight(contentHeight);
        }}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          lineNumbers: 'off',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          overviewRulerBorder: false,
          overviewRulerLanes: 0,
          scrollbar: { vertical: 'auto', horizontal: 'auto', alwaysConsumeMouseWheel: false },
          folding: false,
          glyphMargin: false,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 0,
          renderLineHighlight: 'none',
          contextmenu: false,
          padding: { top: 8, bottom: 8 },
        }}
      />
    </div>
  );
}
