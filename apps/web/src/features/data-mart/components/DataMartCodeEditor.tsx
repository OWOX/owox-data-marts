import { Editor } from '@monaco-editor/react';
import { useState } from 'react';

export function DataMartCodeEditor() {
  const [sqlCode, setSqlCode] = useState(
    '-- Start writing your SQL query here...\nSELECT * FROM customers;'
  );

  function handleEditorChange(value: string | undefined) {
    if (value !== undefined) {
      setSqlCode(value);
    }
  }
  return (
    <div>
      <Editor
        height='30vh'
        language='sql'
        defaultValue={sqlCode}
        onChange={handleEditorChange}
        theme='light'
        options={{
          selectOnLineNumbers: true,
          hideCursorInOverviewRuler: true,
          minimap: {
            enabled: false,
          },
          scrollBeyondLastLine: false,
          overviewRulerBorder: false,
        }}
      />
    </div>
  );
}
