import { Editor, type OnMount } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { registerSlashCommandProvider } from '../utils/monaco-commands.util.ts';

interface InsightEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string | number;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}

const handleEditorMount: OnMount = (_editor, monaco) => {
  registerSlashCommandProvider(monaco, 'markdown');
};

/**
 * InsightEditor is a component for rendering a markdown editor with customizable options.
 *
 * @param {InsightEditorProps} props - The properties required to render the InsightEditor.
 * @param {string} props.value - The current value of the editor content.
 * @param {function} props.onChange - Callback function triggered when the editor content changes.
 * @param {string} [props.height='60vh'] - Optional height of the editor.
 * @param {string} props.className - Additional class name for styling the editor container.
 */
export function InsightEditor({
  value,
  onChange,
  height = '60vh',
  className,
  readOnly,
}: InsightEditorProps) {
  const { resolvedTheme } = useTheme();

  return (
    <div className={className}>
      <Editor
        height={height}
        language='markdown'
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
        value={value}
        onChange={v => {
          onChange(v ?? '');
        }}
        onMount={handleEditorMount}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          overviewRulerBorder: false,
          automaticLayout: true,
          overviewRulerLanes: 0,
          placeholder: "Press '/' for commands",
          readOnly: Boolean(readOnly),
        }}
      />
    </div>
  );
}

export default InsightEditor;
