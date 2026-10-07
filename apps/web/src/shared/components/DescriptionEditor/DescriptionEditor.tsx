import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react';
import type * as monaco from 'monaco-editor';
import { useTheme } from 'next-themes';
import {
  MarkdownEditor,
  MarkdownEditorTabs,
  MarkdownEditorPreview,
  useMarkdownPreview,
} from '../MarkdownEditor';
import { MarkdownToolbar } from '../MarkdownEditor/MarkdownToolbar';
import { useMarkdownToolbar } from '../MarkdownEditor/useMarkdownToolbar';
import { registerDataMartMentions } from './data-mart-mentions';
import { useDataMartReferences } from './useDataMartReferences';

export interface DescriptionEditorProps extends Pick<
  ComponentPropsWithoutRef<'textarea'>,
  'id' | 'name' | 'aria-describedby' | 'aria-invalid' | 'aria-labelledby' | 'aria-label'
> {
  projectId: string;
  currentDataMartId?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  onBlur?: () => void;
}

export const DescriptionEditor = forwardRef<HTMLTextAreaElement, DescriptionEditorProps>(
  function DescriptionEditor(
    {
      projectId,
      currentDataMartId,
      value,
      onChange,
      disabled = false,
      placeholder = 'Describe business goals and terminology…',
      autoFocus = false,
      onSave,
      onCancel,
      onBlur,
      id,
      name,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      'aria-labelledby': ariaLabelledBy,
      'aria-label': ariaLabel = 'Description',
    },
    ref
  ) {
    const [tab, setTab] = useState<'markdown' | 'preview'>('markdown');
    const [referenceError, setReferenceError] = useState<string | null>(null);
    const loadReferences = useDataMartReferences(projectId, currentDataMartId);
    const latest = useRef({ loadReferences, onSave, onCancel, onBlur });
    latest.current = { loadReferences, onSave, onCancel, onBlur };
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof monaco | null>(null);
    const { applyAction, applyHeadingLevel } = useMarkdownToolbar({
      editorRef,
      monacoRef,
      readOnly: disabled,
    });
    const disposable = useRef<monaco.IDisposable | null>(null);
    const [input, setInput] = useState<HTMLTextAreaElement | null>(null);
    const { resolvedTheme } = useTheme();
    const preview = useMarkdownPreview({ markdown: value, enabled: tab === 'preview' });

    useEffect(() => {
      if (!input) return;
      // Monaco does not expose form ids or these ARIA relationships through its options.
      const attributes = {
        id,
        name,
        'aria-describedby': ariaDescribedBy,
        'aria-invalid': ariaInvalid,
        'aria-labelledby': ariaLabelledBy,
      };
      for (const [attribute, value] of Object.entries(attributes)) {
        if (value === undefined) input.removeAttribute(attribute);
        else input.setAttribute(attribute, String(value));
      }
    }, [input, id, name, ariaDescribedBy, ariaInvalid, ariaLabelledBy]);

    useEffect(() => {
      if (typeof ref === 'function') ref(input);
      else if (ref) ref.current = input;
      return () => {
        if (typeof ref === 'function') ref(null);
        else if (ref) ref.current = null;
      };
    }, [input, ref]);

    useEffect(
      () => () => {
        disposable.current?.dispose();
      },
      [projectId]
    );
    const onMount = useCallback(
      (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => {
        disposable.current?.dispose();
        editorRef.current = editor;
        monacoRef.current = monacoInstance;
        setInput(
          editor.getDomNode()?.querySelector<HTMLTextAreaElement>('textarea.inputarea') ?? null
        );
        const provider = registerDataMartMentions(
          monacoInstance,
          editor,
          projectId,
          () => latest.current.loadReferences(),
          setReferenceError
        );
        disposable.current = provider;
        editor.onDidDispose(() => {
          provider.dispose();
          if (editorRef.current === editor) editorRef.current = null;
          setInput(null);
        });
        editor.onDidBlurEditorText(() => latest.current.onBlur?.());
        editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () =>
          latest.current.onSave?.()
        );
        // Monaco closes its suggestion popup first; Escape cancels editing only when no popup is open.
        editor.addCommand(
          monacoInstance.KeyCode.Escape,
          () => {
            latest.current.onCancel?.();
          },
          '!suggestWidgetVisible'
        );
        if (autoFocus) {
          editor.focus();
          const model = editor.getModel();
          if (model) editor.setPosition(model.getPositionAt(model.getValueLength()));
        }
      },
      [projectId, autoFocus]
    );

    return (
      <div className='w-full min-w-0 space-y-2'>
        <MarkdownEditorTabs value={tab} onChange={setTab} />
        {tab === 'markdown' ? (
          <div className='overflow-hidden rounded-md border'>
            <MarkdownToolbar
              readOnly={disabled}
              onActionClick={applyAction}
              onHeadingClick={applyHeadingLevel}
            />
            <MarkdownEditor
              key={projectId}
              value={value}
              onChange={onChange}
              onMount={onMount}
              placeholder={placeholder}
              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
              options={{
                readOnly: disabled,
                fixedOverflowWidgets: true,
                tabIndex: 0,
                ariaLabel,
                // Keep a labelable native textarea for FormControl and React Hook Form.
                editContext: false,
                quickSuggestions: { other: true, comments: false, strings: false },
                wordBasedSuggestions: 'off',
              }}
            />
          </div>
        ) : (
          <MarkdownEditorPreview {...preview} />
        )}
        <p className='text-muted-foreground text-xs'>
          Type @ to find and link a published Data Mart. Links do not change context assignments or
          access.
        </p>
        {referenceError && (
          <p role='alert' className='text-destructive text-xs'>
            {referenceError}
          </p>
        )}
      </div>
    );
  }
);
