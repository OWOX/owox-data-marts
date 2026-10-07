import { useRef } from 'react';
import { Editor, type OnMount } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { registerTemplateSlashCommandProvider } from '../utils/monaco-template-commands.util';
import { useMarkdownToolbar } from '../../../../shared/components/MarkdownEditor/useMarkdownToolbar';
import { MarkdownToolbar } from '../../../../shared/components/MarkdownEditor/MarkdownToolbar';
import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { SquareSlash } from 'lucide-react';
import type { InsightTemplateSourceEntity } from '../model';
import type * as monacoEditor from 'monaco-editor';

export interface InsightTemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  sources?: InsightTemplateSourceEntity[];
  readOnly?: boolean;
  height?: string | number;
  onMount?: OnMount;
  showToolbar?: boolean;
  collapsibleToolbar?: boolean;
  defaultToolbarCollapsed?: boolean;
}

export function InsightTemplateEditor({
  value,
  onChange,
  sources = [],
  readOnly = false,
  height = '100%',
  onMount,
  showToolbar = true,
  collapsibleToolbar = false,
  defaultToolbarCollapsed = false,
}: InsightTemplateEditorProps) {
  const { resolvedTheme } = useTheme();
  const monacoRef = useRef<typeof monacoEditor | null>(null);
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const sourcesRef = useRef<InsightTemplateSourceEntity[]>(sources);
  sourcesRef.current = sources;

  const { applyAction, applyHeadingLevel } = useMarkdownToolbar({
    editorRef,
    monacoRef,
    readOnly,
  });

  const insertTemplateCommand = () => {
    if (readOnly) return;
    const editor = editorRef.current;
    const monacoInstance = monacoRef.current;
    if (!editor || !monacoInstance || !editor.getModel()) return;
    const position = editor.getPosition();
    const selection =
      editor.getSelection() ??
      (position
        ? new monacoInstance.Selection(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column
          )
        : null);
    if (!selection) return;
    editor.focus();
    editor.executeEdits('template-command', [
      { range: selection, text: '/', forceMoveMarkers: true },
    ]);
    setTimeout(() => {
      if (editorRef.current !== editor) return;
      editor.focus();
      editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
    }, 50);
  };

  const handleMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance as unknown as typeof monacoEditor;

    const cleanupProviders = registerTemplateSlashCommandProvider(
      monacoInstance as unknown as typeof monacoEditor,
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

      if (/(?:\s|^)source\s*=\s*"([^"]*)$/i.test(tagContent)) {
        editor.trigger('cursor', 'editor.action.triggerSuggest', {});
        return;
      }

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

    onMount?.(editor, monacoInstance);
  };

  return (
    <div className='flex h-full flex-col overflow-hidden rounded-tl-md' style={{ height }}>
      <MarkdownToolbar
        readOnly={readOnly}
        showToolbar={showToolbar}
        collapsible={collapsibleToolbar}
        defaultCollapsed={defaultToolbarCollapsed}
        onActionClick={applyAction}
        onHeadingClick={applyHeadingLevel}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='h-8 w-8'
              disabled={readOnly}
              onClick={insertTemplateCommand}
              aria-label='Slash commands'
            >
              <SquareSlash className='h-4 w-4' />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Slash commands</TooltipContent>
        </Tooltip>
      </MarkdownToolbar>

      <div className='min-h-0 flex-1'>
        <Editor
          className='h-full overflow-hidden'
          language='markdown'
          value={value}
          onChange={v => {
            onChange(v ?? '');
          }}
          onMount={handleMount}
          height='100%'
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
      </div>
    </div>
  );
}
