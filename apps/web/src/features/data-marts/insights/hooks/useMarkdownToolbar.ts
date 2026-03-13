import { useCallback } from 'react';
import type * as monacoEditor from 'monaco-editor';
import type { EditorContext, MarkdownAction } from '../components/InsightTemplateEditor.constants';

export interface UseMarkdownToolbarProps {
  editorRef: React.RefObject<monacoEditor.editor.IStandaloneCodeEditor | null>;
  monacoRef: React.RefObject<typeof monacoEditor | null>;
  readOnly?: boolean;
}

export function useMarkdownToolbar({
  editorRef,
  monacoRef,
  readOnly = false,
}: UseMarkdownToolbarProps) {
  const getEditorContext = useCallback((): EditorContext | null => {
    if (readOnly) return null;
    const editor = editorRef.current;
    const monacoInstance = monacoRef.current;
    if (!editor || !monacoInstance) return null;

    const model = editor.getModel();
    if (!model) return null;

    const selection =
      editor.getSelection() ??
      (() => {
        const pos = editor.getPosition();
        if (!pos) return null;
        return new monacoInstance.Selection(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
      })();
    if (!selection) return null;

    const selectedText = model.getValueInRange(selection);
    const hasSelection = selectedText.length > 0;
    const start = selection.getStartPosition();
    const end = selection.getEndPosition();

    return {
      editor,
      monaco: monacoInstance,
      model,
      selection,
      selectedText,
      hasSelection,
      start,
      end,
    };
  }, [readOnly, editorRef, monacoRef]);

  const focusEditor = useCallback((editor: monacoEditor.editor.IStandaloneCodeEditor) => {
    setTimeout(() => {
      if (editor.hasTextFocus()) return;
      editor.focus();
    }, 100);
  }, []);

  const setSelection = useCallback(
    (
      editor: monacoEditor.editor.IStandaloneCodeEditor,
      monacoInstance: typeof monacoEditor,
      range: monacoEditor.IRange | monacoEditor.Selection
    ) => {
      const sel =
        range instanceof monacoInstance.Selection
          ? range
          : new monacoInstance.Selection(
              range.startLineNumber,
              range.startColumn,
              range.endLineNumber,
              range.endColumn
            );
      editor.setSelection(sel);
      editor.revealRange(sel, monacoInstance.editor.ScrollType.Smooth);
    },
    []
  );

  const applyEdit = useCallback(
    (
      editor: monacoEditor.editor.IStandaloneCodeEditor,
      range: monacoEditor.IRange,
      text: string
    ) => {
      editor.executeEdits('markdown-toolbar', [{ range, text, forceMoveMarkers: true }]);
    },
    []
  );

  const wrapSelection = useCallback(
    (ctx: EditorContext, prefix: string, suffix: string, emptyPlaceholder = '') => {
      const {
        editor,
        monaco: monacoInstance,
        selection,
        selectedText,
        hasSelection,
        start,
        end,
      } = ctx;
      const inner = hasSelection ? selectedText : emptyPlaceholder;
      const text = `${prefix}${inner}${suffix}`;
      applyEdit(editor, selection, text);

      if (hasSelection) {
        setSelection(
          editor,
          monacoInstance,
          new monacoInstance.Selection(
            start.lineNumber,
            start.column + prefix.length,
            end.lineNumber,
            end.column + prefix.length
          )
        );
      } else {
        const offset = prefix.length + inner.length;
        editor.setPosition(new monacoInstance.Position(start.lineNumber, start.column + offset));
      }
    },
    [applyEdit, setSelection]
  );

  const mapLines = useCallback(
    (text: string, mapper: (line: string, index: number) => string, fallback: string) => {
      return (text || fallback)
        .split('\n')
        .map((line, idx) => mapper(line, idx))
        .join('\n');
    },
    []
  );

  const applyBold = useCallback(
    (ctx: EditorContext) => {
      wrapSelection(ctx, '**', '**', '');
    },
    [wrapSelection]
  );

  const applyItalic = useCallback(
    (ctx: EditorContext) => {
      wrapSelection(ctx, '*', '*', '');
    },
    [wrapSelection]
  );

  const applyLink = useCallback(
    (ctx: EditorContext) => {
      const { editor, monaco: monacoInstance, selection, selectedText, start } = ctx;
      const text = selectedText || 'text';
      const urlPlaceholder = 'https://example.com';
      const insert = `[${text}](${urlPlaceholder})`;
      applyEdit(editor, selection, insert);
      const cursorColumn = start.column + text.length + 3;
      editor.setPosition(new monacoInstance.Position(start.lineNumber, cursorColumn));
    },
    [applyEdit]
  );

  const applyList = useCallback(
    (ctx: EditorContext) => {
      const { editor, monaco: monacoInstance, selection, selectedText, start } = ctx;
      const lines = mapLines(selectedText, line => `- ${line || 'item'}`, 'item');
      applyEdit(editor, selection, lines);
      const linesArr = lines.split('\n');
      const lastLine = linesArr.at(-1) ?? '';
      const cursor = new monacoInstance.Position(
        start.lineNumber + linesArr.length - 1,
        linesArr.length === 1 ? start.column + lastLine.length : lastLine.length + 1
      );
      editor.setPosition(cursor);
    },
    [applyEdit, mapLines]
  );

  const applyOrderedList = useCallback(
    (ctx: EditorContext) => {
      const { editor, monaco: monacoInstance, selection, selectedText, start } = ctx;
      const lines = mapLines(
        selectedText,
        (line, idx) => `${String(idx + 1)}. ${line || 'item'}`,
        'item'
      );
      applyEdit(editor, selection, lines);
      const linesArr = lines.split('\n');
      const lastLine = linesArr.at(-1) ?? '';
      const cursor = new monacoInstance.Position(
        start.lineNumber + linesArr.length - 1,
        linesArr.length === 1 ? start.column + lastLine.length : lastLine.length + 1
      );
      editor.setPosition(cursor);
    },
    [applyEdit, mapLines]
  );

  const applyTaskList = useCallback(
    (ctx: EditorContext) => {
      const { editor, monaco: monacoInstance, selection, selectedText, start } = ctx;
      const lines = mapLines(selectedText, line => `- [ ] ${line || 'task'}`, 'task');
      applyEdit(editor, selection, lines);
      const linesArr = lines.split('\n');
      const lastLine = linesArr.at(-1) ?? '';
      const cursor = new monacoInstance.Position(
        start.lineNumber + linesArr.length - 1,
        linesArr.length === 1 ? start.column + lastLine.length : lastLine.length + 1
      );
      editor.setPosition(cursor);
    },
    [applyEdit, mapLines]
  );

  const applyQuote = useCallback(
    (ctx: EditorContext) => {
      const { editor, monaco: monacoInstance, selection, selectedText, start } = ctx;
      const lines = mapLines(selectedText, line => `> ${line}`, 'Quote');
      applyEdit(editor, selection, lines);
      const linesArr = lines.split('\n');
      const lastLine = linesArr.at(-1) ?? '';
      const cursor = new monacoInstance.Position(
        start.lineNumber + linesArr.length - 1,
        linesArr.length === 1 ? start.column + lastLine.length : lastLine.length + 1
      );
      editor.setPosition(cursor);
    },
    [applyEdit, mapLines]
  );

  const applyCodeBlock = useCallback(
    (ctx: EditorContext) => {
      const { editor, monaco: monacoInstance, selection, selectedText, hasSelection, start } = ctx;
      const text = selectedText || 'code';
      const lines = text.split('\n');
      const insert = '```\n' + text + '\n```\n';
      applyEdit(editor, selection, insert);
      const lineOffset = 1;
      const cursor = hasSelection
        ? new monacoInstance.Selection(
            start.lineNumber + lineOffset,
            1,
            start.lineNumber + lineOffset + lines.length - 1,
            lines.slice(-1)[0].length + 1
          )
        : new monacoInstance.Position(start.lineNumber + lineOffset, 1);

      if (cursor instanceof monacoInstance.Selection) {
        setSelection(editor, monacoInstance, cursor);
      } else {
        editor.setPosition(cursor);
        editor.revealPosition(cursor, monacoInstance.editor.ScrollType.Smooth);
      }
    },
    [applyEdit, setSelection]
  );

  const applyTable = useCallback(
    (ctx: EditorContext) => {
      const { editor, monaco: monacoInstance, selection, selectedText, start } = ctx;
      const text = selectedText || 'Value';
      const insert = `| Column 1 | Column 2 |\n| --- | --- |\n| ${text} |  |\n|  |  |\n`;
      applyEdit(editor, selection, insert);
      const cursor = new monacoInstance.Position(start.lineNumber + 2, 3 + text.length);
      editor.setPosition(cursor);
    },
    [applyEdit]
  );

  const applyAction = useCallback(
    (actionId: MarkdownAction['id']) => {
      const ctx = getEditorContext();
      if (!ctx) return;

      const { editor } = ctx;
      focusEditor(editor);

      switch (actionId) {
        case 'bold':
          applyBold(ctx);
          break;
        case 'italic':
          applyItalic(ctx);
          break;
        case 'link':
          applyLink(ctx);
          break;
        case 'list':
          applyList(ctx);
          break;
        case 'ordered-list':
          applyOrderedList(ctx);
          break;
        case 'task-list':
          applyTaskList(ctx);
          break;
        case 'quote':
          applyQuote(ctx);
          break;
        case 'code-block':
          applyCodeBlock(ctx);
          break;
        case 'table':
          applyTable(ctx);
          break;
        default:
          break;
      }

      focusEditor(editor);
    },
    [
      getEditorContext,
      focusEditor,
      applyBold,
      applyItalic,
      applyLink,
      applyList,
      applyOrderedList,
      applyTaskList,
      applyQuote,
      applyCodeBlock,
      applyTable,
    ]
  );

  const applyHeadingLevel = useCallback(
    (level: number) => {
      const ctx = getEditorContext();
      if (!ctx) return;
      const { editor, monaco: monacoInstance, selection, selectedText, hasSelection, start } = ctx;
      focusEditor(editor);

      const hashes = '#'.repeat(level);
      const text = hasSelection
        ? selectedText
            .split('\n')
            .map(line => `${hashes} ${line.trimStart() || 'Heading'}`)
            .join('\n')
        : `${hashes} `;

      applyEdit(editor, selection, text);

      const cursor = hasSelection
        ? new monacoInstance.Selection(
            start.lineNumber,
            start.column + hashes.length + 1,
            start.lineNumber + text.split('\n').length - 1,
            (text.split('\n').at(-1)?.length ?? hashes.length + 1) + start.column
          )
        : new monacoInstance.Position(start.lineNumber, start.column + hashes.length + 1);

      if (cursor instanceof monacoInstance.Selection) {
        setSelection(editor, monacoInstance, cursor);
      } else {
        editor.setPosition(cursor);
        editor.revealPosition(cursor, monacoInstance.editor.ScrollType.Smooth);
      }
      focusEditor(editor);
    },
    [getEditorContext, focusEditor, applyEdit, setSelection]
  );

  return {
    applyAction,
    applyHeadingLevel,
  };
}
