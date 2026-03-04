import { useRef } from 'react';
import { Editor, type OnMount } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { registerTemplateSlashCommandProvider } from '../utils/monaco-template-commands.util';
import type { InsightTemplateSourceEntity } from '../model';
import type * as monacoEditor from 'monaco-editor';

interface InsightTemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  sources?: InsightTemplateSourceEntity[];
  readOnly?: boolean;
  height?: string | number;
  onMount?: OnMount;
}
export function InsightTemplateEditor({
  value,
  onChange,
  sources = [],
  readOnly = false,
  height = '100%',
  onMount,
}: InsightTemplateEditorProps) {
  const { resolvedTheme } = useTheme();
  const monacoRef = useRef<typeof monacoEditor | null>(null);

  const sourcesRef = useRef<InsightTemplateSourceEntity[]>(sources);
  sourcesRef.current = sources;

  const handleMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco as unknown as typeof monacoEditor;

    const cleanupProviders = registerTemplateSlashCommandProvider(
      monaco as unknown as typeof monacoEditor,
      'markdown',
      () => sourcesRef.current
    );

    editor.onDidDispose(cleanupProviders);

    editor.onDidChangeCursorPosition(e => {
      if (e.reason !== 3) return; // eslint-disable-line @typescript-eslint/no-unsafe-enum-comparison

      const model = editor.getModel();
      if (!model) return;

      const { lineNumber, column } = e.position;
      const textUntilPosition = model.getValueInRange({
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: column,
      });

      const lastOpenTag = textUntilPosition.lastIndexOf('{{');
      const lastCloseTag = textUntilPosition.lastIndexOf('}}');
      if (lastOpenTag === -1 || lastOpenTag < lastCloseTag) return;

      const tagContent = textUntilPosition.substring(lastOpenTag + 2);
      const tagNameMatch = /^(\w+)/.exec(tagContent);
      if (!tagNameMatch || (tagNameMatch[1] !== 'table' && tagNameMatch[1] !== 'value')) return;

      // Case 1: cursor is right after the opening quote — source="|  or  source="partial|
      if (/(?:\s|^)source\s*=\s*"([^"]*)$/i.test(tagContent)) {
        editor.trigger('cursor', 'editor.action.triggerSuggest', {});
        return;
      }

      // Case 2: cursor is inside a complete source="value" attribute (user clicked inside quotes)
      const fullLine = model.getLineContent(lineNumber);
      const sourceAttrFullMatch = /(?:\s|^)source\s*=\s*"([^"]*)"/gi;
      let match;
      while ((match = sourceAttrFullMatch.exec(fullLine)) !== null) {
        const quotePos = match.index + match[0].indexOf('"');
        const start = quotePos + 1;
        const end = start + match[1].length;
        // column is 1-based; convert to 0-based for comparison
        if (column - 1 >= start && column - 1 <= end) {
          editor.trigger('cursor', 'editor.action.triggerSuggest', {});
          return;
        }
      }
    });

    onMount?.(editor, monaco);
  };

  return (
    <Editor
      className='h-full overflow-hidden rounded-tl-md'
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
