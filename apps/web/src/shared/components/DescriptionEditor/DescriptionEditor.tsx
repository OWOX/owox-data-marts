import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type RefObject,
} from 'react';
import type * as monaco from 'monaco-editor';
import { useTheme } from 'next-themes';
import { Check, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { MarkdownEditor } from '../MarkdownEditor';
import { ExpandableEditor } from '../MarkdownEditor/ExpandableEditor';
import { MarkdownToolbar } from '../MarkdownEditor/MarkdownToolbar';
import { useMarkdownToolbar } from '../MarkdownEditor/useMarkdownToolbar';
import { DataMartMentionPicker } from './DataMartMentionPicker';
import { CopyDescriptionButton, DescriptionView, type DescriptionScope } from './DescriptionView';
import { preventSheetDismissWhileSuggesting } from './description-editor-escape';

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
  saveError?: string | null;
  footer?: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onSave?: () => void;
  onCancel?: () => void;
  onBlur?: () => void;
  /** Inline editors already have their own reading state and Save/Cancel actions. */
  startEditing?: boolean;
  scope?: DescriptionScope;
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
      saveError,
      footer,
      returnFocusRef,
      onSave,
      onCancel,
      onBlur,
      startEditing = false,
      scope = 'context',
      id,
      name,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      'aria-labelledby': ariaLabelledBy,
      'aria-label': ariaLabel = 'Description',
    },
    ref
  ) {
    const [editing, setEditing] = useState(startEditing);
    const [expanded, setExpanded] = useState(false);
    const editButtonRef = useRef<HTMLButtonElement>(null);
    const wasEditing = useRef(false);
    useEffect(() => {
      if (!editing && wasEditing.current) editButtonRef.current?.focus();
      wasEditing.current = editing;
    }, [editing]);
    const latest = useRef({ onSave, onCancel, onBlur });
    latest.current = { onSave, onCancel, onBlur };
    const [mountedEditor, setMountedEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(
      null
    );
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof monaco | null>(null);
    const { applyAction, applyHeadingLevel } = useMarkdownToolbar({
      editorRef,
      monacoRef,
      readOnly: disabled,
    });
    const [input, setInput] = useState<HTMLTextAreaElement | null>(null);
    const { resolvedTheme } = useTheme();

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

    const onMount = useCallback(
      (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => {
        editorRef.current = editor;
        setMountedEditor(editor);
        monacoRef.current = monacoInstance;
        setInput(
          editor.getDomNode()?.querySelector<HTMLTextAreaElement>('textarea.inputarea') ?? null
        );
        editor.onDidDispose(() => {
          if (editorRef.current === editor) editorRef.current = null;
          setMountedEditor(null);
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
        if (autoFocus || !startEditing) {
          editor.focus();
          const model = editor.getModel();
          if (model) editor.setPosition(model.getPositionAt(model.getValueLength()));
        }
      },
      [autoFocus, startEditing]
    );

    if (!editing) {
      return (
        <DescriptionView
          projectId={projectId}
          value={value}
          placeholder={placeholder}
          scope={scope}
          disabled={disabled}
          onEdit={() => {
            setEditing(true);
          }}
          editButtonProps={{
            ref: editButtonRef,
            id,
            name,
            onBlur,
            'aria-describedby': ariaDescribedBy,
            'aria-invalid': ariaInvalid,
            'aria-labelledby': ariaLabelledBy,
          }}
        />
      );
    }

    return (
      <ExpandableEditor
        expanded={expanded}
        onExpandedChange={setExpanded}
        title='Description editor'
        returnFocusRef={returnFocusRef ?? editButtonRef}
        onEscapeKeyDown={preventSheetDismissWhileSuggesting}
      >
        <div
          className={cn(
            'w-full min-w-0 space-y-2',
            expanded && 'flex min-h-0 flex-1 flex-col gap-2 space-y-0'
          )}
          data-testid='descriptionEditor'
        >
          <div className='flex items-center justify-between gap-2'>
            <p className='text-muted-foreground text-xs'>Supports Markdown formatting.</p>
            <div className='flex items-center gap-1'>
              <CopyDescriptionButton value={value} scope={scope} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    aria-label={expanded ? 'Exit full screen' : 'Expand description editor'}
                    aria-expanded={expanded}
                    onClick={() => {
                      setExpanded(!expanded);
                    }}
                  >
                    {expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {expanded ? 'Exit full screen' : 'Expand description editor'}
                </TooltipContent>
              </Tooltip>
              {!startEditing && (
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  disabled={disabled}
                  onClick={() => {
                    setExpanded(false);
                    setEditing(false);
                  }}
                >
                  <Check aria-hidden />
                  Done editing
                </Button>
              )}
            </div>
          </div>
          <div
            className={cn(
              'overflow-hidden rounded-md border',
              expanded && 'flex min-h-0 flex-1 flex-col'
            )}
          >
            <MarkdownToolbar
              showFormatBadge={false}
              readOnly={disabled}
              onActionClick={applyAction}
              onHeadingClick={applyHeadingLevel}
            />
            <div className={expanded ? 'min-h-0 flex-1' : undefined}>
              <MarkdownEditor
                key={projectId}
                height={expanded ? '100%' : 240}
                value={value}
                onChange={onChange}
                onMount={onMount}
                placeholder={placeholder}
                theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                options={{
                  readOnly: disabled,
                  padding: { top: 8 },
                  fixedOverflowWidgets: true,
                  tabIndex: 0,
                  ariaLabel,
                  // Keep a labelable native textarea for FormControl and React Hook Form.
                  editContext: false,
                  quickSuggestions: false,
                  suggestOnTriggerCharacters: false,
                  wordBasedSuggestions: 'off',
                }}
              />
            </div>
            <DataMartMentionPicker
              editor={mountedEditor}
              projectId={projectId}
              currentDataMartId={currentDataMartId}
              disabled={disabled}
            />
          </div>
          <p className='text-muted-foreground text-xs'>
            Type @ to link a published Data Mart or one of its fields. Links do not change context
            assignments or access.
          </p>
          {saveError && (
            <p className='text-destructive text-xs' role='alert'>
              {saveError}
            </p>
          )}
          {footer && <div className='shrink-0'>{footer}</div>}
        </div>
      </ExpandableEditor>
    );
  }
);
