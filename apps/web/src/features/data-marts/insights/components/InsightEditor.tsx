import type * as monacoEditor from 'monaco-editor';
import { Editor } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { Command, CommandInput, CommandItem, CommandList } from '@owox/ui/components/command';
import { useInsights, useInsightsList } from '../model';
import {
  registerSlashCommandProvider,
  setActiveCopyTemplateHandler,
} from '../utils/monaco-commands.util.ts';
import { toast } from 'react-hot-toast';

interface InsightEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string | number;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  showLineNumbers?: boolean;
}
type Monaco = typeof monacoEditor;

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
  showLineNumbers = true,
}: InsightEditorProps) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [menuMaxHeight, setMenuMaxHeight] = useState<number>(320);
  const [query, setQuery] = useState('');
  const disposablesRef = useRef<{
    provider?: monacoEditor.IDisposable;
    scroll?: monacoEditor.IDisposable;
    mouse?: monacoEditor.IDisposable;
    layout?: monacoEditor.IDisposable;
    cursor?: monacoEditor.IDisposable;
    content?: monacoEditor.IDisposable;
    model?: monacoEditor.IDisposable;
    blur?: monacoEditor.IDisposable;
    focusText?: monacoEditor.IDisposable;
    config?: monacoEditor.IDisposable;
    placeholderWidget?: { dispose: () => void };
  } | null>(null);

  const { insights, isLoading: insightsLoading, isLoaded } = useInsightsList();
  const { fetchInsights, getInsightSilently } = useInsights();

  const openMenu = () => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const layoutInfo = editor.getLayoutInfo();
    const contentLeft = layoutInfo.contentLeft;
    const contentWidth = layoutInfo.contentWidth;
    const PADDING = 8;
    const MENU_WIDTH = 288;
    const MAX_OFFSET = 16;

    const desiredLeft = contentLeft + (contentWidth - MENU_WIDTH) / 2;
    const minLeft = contentLeft + PADDING;
    const maxLeft = contentLeft + Math.max(0, contentWidth - MENU_WIDTH - PADDING);
    const left = Math.min(Math.max(desiredLeft, minLeft), maxLeft);

    setMenuPos({ top: PADDING, left });
    const editorHeight = layoutInfo.height;
    const maxH = Math.max(120, editorHeight - MAX_OFFSET);
    setMenuMaxHeight(maxH);
    setIsOpen(true);
  };

  const handleSelectCopyInsight = async (insight: {
    id: string;
    title: string;
    template: string | null;
  }) => {
    const editor = editorRef.current;
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    const cursor = editor.getPosition();
    if (!cursor) return;

    const insertRange: monacoEditor.IRange = {
      startLineNumber: cursor.lineNumber,
      startColumn: cursor.column,
      endLineNumber: cursor.lineNumber,
      endColumn: cursor.column,
    };

    let templateText = insight.template ?? '';
    if (!templateText || templateText.length === 0) {
      try {
        const full = await getInsightSilently(insight.id);
        templateText = full?.template ?? '';
        if (templateText.length === 0) {
          toast.error('Insight template is empty');
          setIsOpen(false);
          return;
        }
      } catch {
        console.error('[InsightEditor] Failed to fetch insight template - skipping');
      }
    }

    const textToInsert = templateText.concat(
      `\n\n<!-- Copied from Insight: ${insight.title} (${insight.id}) -->\n`
    );

    editor.executeEdits('insight-editor', [
      {
        range: insertRange,
        text: textToInsert,
        forceMoveMarkers: true,
      },
    ]);

    editor.focus();
    setIsOpen(false);
  };

  const handleMount = (editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    registerSlashCommandProvider(monaco as unknown as typeof import('monaco-editor'), 'markdown');

    const activateThisEditorForCopyTemplate = () => {
      setActiveCopyTemplateHandler(() => {
        if (!isLoaded && !insightsLoading) {
          void fetchInsights();
        }
        setQuery('');
        openMenu();
      });
    };

    activateThisEditorForCopyTemplate();
    const focus = editor.onDidFocusEditorText(() => {
      activateThisEditorForCopyTemplate();
    });
    const scroll = editor.onDidScrollChange(() => {
      setIsOpen(false);
    });
    const mouse = editor.onMouseDown(() => {
      setIsOpen(false);
    });

    // Inline placeholder content widget that appears on empty line under the caret
    const widgetId = 'insight-editor-inline-placeholder';
    const node = document.createElement('div');
    node.textContent = "Press '/' for commands";

    const applyPlaceholderStyles = () => {
      try {
        const fontInfo = editor.getOption(monaco.editor.EditorOption.fontInfo);
        const fontSize = `${String(fontInfo.fontSize)}px`;
        const lineHeight = `${String(fontInfo.lineHeight)}px`;
        const fontFamily = fontInfo.fontFamily;

        Object.assign(node.style, {
          color: 'inherit',
          opacity: '0.55',
          fontStyle: 'italic',
          fontSize,
          lineHeight,
          fontFamily,
          pointerEvents: 'none',
          whiteSpace: 'pre',
          userSelect: 'none',
        });
      } catch {
        Object.assign(node.style, {
          color: 'inherit',
          opacity: '0.55',
          fontStyle: 'italic',
          pointerEvents: 'none',
          whiteSpace: 'pre',
          userSelect: 'none',
        });
      }
    };

    applyPlaceholderStyles();

    let currentPosition: monacoEditor.editor.IContentWidgetPosition | null = null;

    let lastKnownPosition: monacoEditor.IPosition | null = null;

    const widget: monacoEditor.editor.IContentWidget = {
      getId: () => widgetId,
      getDomNode: () => node,
      getPosition: () => currentPosition,
    };

    editor.addContentWidget(widget);

    const showAt = (lineNumber: number) => {
      currentPosition = {
        position: { lineNumber, column: 1 },
        preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
      };
      node.style.display = '';
      editor.layoutContentWidget(widget);
    };
    const hide = () => {
      currentPosition = null;
      node.style.display = 'none';
      editor.layoutContentWidget(widget);
    };

    const updatePlaceholder = () => {
      const model = editor.getModel();
      const pos = editor.getPosition() ?? lastKnownPosition;
      if (!model || !pos) {
        hide();
        return;
      }
      const maxLine = model.getLineCount();
      const safeLine = Math.min(Math.max(1, pos.lineNumber), Math.max(1, maxLine));
      const line = model.getLineContent(safeLine);
      if (line.trim().length === 0) {
        showAt(safeLine);
      } else {
        hide();
      }
    };

    // Initial update
    updatePlaceholder();

    const cursor = editor.onDidChangeCursorPosition(() => {
      const pos = editor.getPosition();
      if (pos) lastKnownPosition = pos;
      updatePlaceholder();
    });
    const content = editor.onDidChangeModelContent(() => {
      updatePlaceholder();
    });
    const model = editor.onDidChangeModel(() => {
      updatePlaceholder();
    });
    const blur = editor.onDidBlurEditorText(() => {
      updatePlaceholder();
    });
    const focusText = editor.onDidFocusEditorText(() => {
      const pos = editor.getPosition();
      if (pos) lastKnownPosition = pos;
      updatePlaceholder();
    });

    const config = editor.onDidChangeConfiguration(() => {
      applyPlaceholderStyles();
      updatePlaceholder();
    });

    disposablesRef.current = {
      scroll,
      mouse,
      layout: focus,
      cursor,
      content,
      model,
      blur,
      focusText,
      config,
      placeholderWidget: {
        dispose: () => {
          try {
            editor.removeContentWidget(widget);
          } catch {
            // ignore removeContentWidget errors
          }
        },
      },
    };
  };

  useEffect(() => {
    return () => {
      setActiveCopyTemplateHandler(null);
      const disposables = disposablesRef.current;
      if (disposables) {
        try {
          disposables.scroll?.dispose();
          disposables.mouse?.dispose();
          disposables.layout?.dispose();
          disposables.cursor?.dispose();
          disposables.content?.dispose();
          disposables.model?.dispose();
          disposables.blur?.dispose();
          disposables.focusText?.dispose();
          disposables.config?.dispose();
          disposables.placeholderWidget?.dispose();
        } catch {
          // ignore
        }
        disposablesRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const container = containerRef.current;
      if (container && target && !container.contains(target)) {
        setIsOpen(false);
      }
    };

    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      e.preventDefault();
      e.stopPropagation();

      setIsOpen(false);
      setQuery('');
      editorRef.current?.focus();
    };

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDownCapture, true);

    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDownCapture, true);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative' }}>
      <Editor
        height={height}
        language='markdown'
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
        className='overflow-hidden rounded-tl-md'
        value={value}
        onChange={v => {
          onChange(v ?? '');
        }}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          overviewRulerBorder: false,
          automaticLayout: true,
          overviewRulerLanes: 0,
          readOnly: Boolean(readOnly),
          lineNumbers: showLineNumbers ? 'on' : 'off',
        }}
      />

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: menuPos.top,
            left: menuPos.left,
            zIndex: 60,
          }}
          onMouseDown={e => {
            e.stopPropagation();
          }}
        >
          <div
            className='bg-popover text-popover-foreground flex w-72 flex-col rounded-md border shadow-md outline-none'
            style={{ maxHeight: menuMaxHeight }}
          >
            <Command className='flex min-h-0 flex-col'>
              <CommandInput
                autoFocus
                placeholder='Search insights…'
                value={query}
                onValueChange={setQuery}
              />
              <CommandList className='flex-1 overflow-auto'>
                {insightsLoading && <div className='p-2 text-sm opacity-60'>Loading…</div>}
                {!insightsLoading &&
                  insights
                    .filter(i =>
                      (query || '').length
                        ? i.title.toLowerCase().includes(query.toLowerCase())
                        : true
                    )
                    .map(i => (
                      <CommandItem
                        key={i.id}
                        value={`${i.id}:${i.title}`}
                        onSelect={() => {
                          void handleSelectCopyInsight(i);
                        }}
                      >
                        <span className='block w-full truncate whitespace-nowrap'>{i.title}</span>
                      </CommandItem>
                    ))}
                {!insightsLoading && insights.length === 0 && (
                  <div className='p-2 text-sm opacity-60'>No insights</div>
                )}
              </CommandList>
            </Command>
          </div>
        </div>
      )}
    </div>
  );
}

export default InsightEditor;
