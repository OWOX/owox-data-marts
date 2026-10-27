import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type * as Monaco from 'monaco-editor';
import { ArrowLeft, Calculator, ChevronRight, Columns3, Loader2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@owox/ui/components/command';
import { DataMartIconGlyph } from '../../../features/data-marts/shared/components/DataMartIcon';
import { useDataMartFieldReferences, useDataMartReferences } from './useDataMartReferences';
import {
  dataMartMarkdownLink,
  mentionAtCursor,
  type DataMartFieldReference,
  type DataMartReference,
} from './data-mart-mentions';

interface Mention {
  model: Monaco.editor.ITextModel;
  range: Monaco.IRange;
  position: Monaco.IPosition;
  query: string;
  source: string;
}

export interface DataMartMentionPickerProps {
  editor: Monaco.editor.IStandaloneCodeEditor | null;
  projectId: string;
  currentDataMartId?: string;
  disabled: boolean;
  /**
   * Finds the mention being typed right before the caret, given the text up to it. Defaults to
   * an `@` in Markdown text.
   */
  findMention?: (prefix: string) => { query: string; start: number } | null;
  /**
   * Loads the Data Marts to offer. Defaults to the project's published Data Marts. Keep it stable
   * (`useCallback`): a new function reloads the list.
   */
  loadDataMarts?: () => Promise<DataMartReference[]>;
  /** The text inserted for a picked Data Mart (and field). Defaults to a Markdown link. */
  formatReference?: (reference: DataMartReference, field?: DataMartFieldReference) => string;
  /** Offer the picked Data Mart's fields as a second step. Defaults to true. */
  pickFields?: boolean;
  /** Shown under the search box, e.g. what limits the list. */
  note?: string;
  /** Called after a reference is inserted. */
  onInsert?: (reference: DataMartReference, field?: DataMartFieldReference) => void;
}

export function DataMartMentionPicker({
  editor,
  projectId,
  currentDataMartId,
  disabled,
  findMention,
  loadDataMarts,
  formatReference,
  pickFields = true,
  note,
  onInsert,
}: DataMartMentionPickerProps) {
  const loadPublishedMarts = useDataMartReferences(projectId, currentDataMartId);
  const loadMarts = loadDataMarts ?? loadPublishedMarts;
  // Read through a ref so a caller passing an inline function does not re-subscribe the editor.
  const findMentionRef = useRef(findMention ?? mentionAtCursor);
  useLayoutEffect(() => {
    findMentionRef.current = findMention ?? mentionAtCursor;
  }, [findMention]);
  const loadFields = useDataMartFieldReferences(projectId);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [mention, setMention] = useState<Mention | null>(null);
  const [mart, setMart] = useState<DataMartReference | null>(null);
  const [marts, setMarts] = useState<DataMartReference[]>([]);
  const [fields, setFields] = useState<DataMartFieldReference[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeMention = useRef<Mention | null>(null);
  const dismissedMention = useRef<{ model: Monaco.editor.ITextModel; start: number } | null>(null);
  const widgetRef = useRef<Monaco.editor.IContentWidget | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dismiss = useCallback(() => {
    const active = activeMention.current;
    if (active) {
      dismissedMention.current = {
        model: active.model,
        start: active.model.getOffsetAt(active.position),
      };
    }
    activeMention.current = null;
    setMention(null);
    if (editor && widgetRef.current) editor.layoutContentWidget(widgetRef.current);
  }, [editor]);

  useEffect(() => {
    activeMention.current = null;
    dismissedMention.current = null;
    setMention(null);
    if (!editor || disabled) return;
    const node = document.createElement('div');
    node.className = 'z-50 w-80 max-w-[calc(100vw-2rem)]';
    const widget: Monaco.editor.IContentWidget = {
      getId: () => 'description-data-mart-mentions',
      getDomNode: () => node,
      allowEditorOverflow: true,
      suppressMouseDown: false,
      getPosition: () =>
        activeMention.current
          ? {
              position: activeMention.current.position,
              preference: [2, 1], // ContentWidgetPositionPreference.BELOW, ABOVE
            }
          : null,
    };
    editor.addContentWidget(widget);
    widgetRef.current = widget;
    setContainer(node);
    const update = (event?: Monaco.editor.IModelContentChangedEvent) => {
      if (!editor.hasTextFocus()) return;
      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) {
        dismiss();
        return;
      }
      const prefix = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const match = findMentionRef.current(prefix);
      const dismissed = dismissedMention.current;
      if (
        dismissed &&
        (dismissed.model !== model ||
          match?.start !== dismissed.start ||
          event?.changes.some(
            change =>
              change.rangeLength > 0 &&
              change.rangeOffset <= dismissed.start &&
              change.rangeOffset + change.rangeLength > dismissed.start
          ))
      ) {
        dismissedMention.current = null;
      }
      if (!match) {
        dismiss();
        return;
      }
      // Cursor motion, ordinary typing, undo and paste must never summon the picker.
      // Only a newly typed @ at the caret starts a reference.
      const insertedTrigger =
        !event?.isUndoing &&
        !event?.isRedoing &&
        !event?.isFlush &&
        event?.changes.some(
          change =>
            change.text === '@' &&
            change.rangeOffset === match.start &&
            change.rangeOffset + 1 === model.getOffsetAt(position)
        );
      if (!activeMention.current && (!insertedTrigger || dismissedMention.current)) return;
      const start = model.getPositionAt(match.start);
      const next: Mention = {
        model,
        range: {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
        position: start,
        query: match.query,
        source: prefix.slice(match.start),
      };
      const previous = activeMention.current;
      if (
        previous &&
        (previous.model !== model || model.getOffsetAt(previous.position) !== match.start)
      ) {
        dismiss();
        return;
      }
      activeMention.current = next;
      setMention(next);
      if (!previous) {
        setMart(null);
        setSearch(match.query);
      }
      editor.layoutContentWidget(widget);
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !node.contains(event.target)) dismiss();
    };
    const subscriptions = [
      editor.onDidChangeModelContent(update),
      editor.onDidChangeCursorPosition(() => {
        update();
      }),
    ];
    document.addEventListener('pointerdown', outside, true);
    return () => {
      subscriptions.forEach(subscription => {
        subscription.dispose();
      });
      document.removeEventListener('pointerdown', outside, true);
      editor.removeContentWidget(widget);
      widgetRef.current = null;
      activeMention.current = null;
    };
  }, [editor, disabled, dismiss]);

  // Re-measure after React renders the list, so Monaco can place it above the
  // caret when the viewport does not have enough room below.
  useLayoutEffect(() => {
    if (editor && widgetRef.current) editor.layoutContentWidget(widgetRef.current);
  }, [editor, container, mention, mart, fields, marts, loading, error, search]);

  const mentionModel = mention?.model;
  const mentionStart = mention ? `${mention.position.lineNumber}:${mention.position.column}` : null;
  useEffect(() => {
    if (!mentionModel) return;
    let active = true;
    setLoading(true);
    setError(null);
    setMarts([]);
    loadMarts()
      .then(
        result => {
          if (active) setMarts(result);
        },
        () => {
          if (active)
            setError('Could not load Data Marts. Close this list and type @ to try again.');
        }
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    // Monaco finishes its own key handling after the content/cursor events.
    // Focus the search once the content widget is visible and that handling ends.
    const focusFrame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => {
      active = false;
      cancelAnimationFrame(focusFrame);
    };
  }, [mentionModel, mentionStart, loadMarts]);

  useEffect(() => {
    setFields([]);
    if (!mart || !mentionModel) return;
    let active = true;
    setLoading(true);
    setError(null);
    loadFields(mart.id)
      .then(
        result => {
          if (active) setFields(result);
        },
        () => {
          if (active)
            setError('Could not load fields. Go back and select this Data Mart to try again.');
        }
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mart, mentionModel, mentionStart, loadFields]);
  const insert = (reference: DataMartReference, field?: DataMartFieldReference) => {
    const model = editor?.getModel();
    // Never replace unrelated text if the model was edited while the picker was open.
    if (!editor || !model || !mention) {
      dismiss();
      return;
    }
    if (model !== mention.model || model.getValueInRange(mention.range) !== mention.source) {
      dismiss();
      return;
    }
    const offset = model.getOffsetAt(mention.position);
    const text = formatReference
      ? formatReference(reference, field)
      : dataMartMarkdownLink(reference, projectId, window.location.origin, field);
    dismiss();
    editor.pushUndoStop();
    editor.executeEdits('description-mention', [
      { range: mention.range, text, forceMoveMarkers: true },
    ]);
    editor.pushUndoStop();
    editor.setPosition(model.getPositionAt(offset + text.length));
    editor.focus();
    onInsert?.(reference, field);
  };
  const back = () => {
    setMart(null);
    setSearch('');
    setError(null);
    setLoading(false);
    inputRef.current?.focus();
  };

  if (!container || !mention) return null;
  const query = search.trim().toLocaleLowerCase();
  const filteredMarts = marts.filter(reference =>
    reference.title.toLocaleLowerCase().includes(query)
  );
  const filteredFields = fields.filter(field =>
    [field.alias, field.name].some(value => value.toLocaleLowerCase().includes(query))
  );
  return createPortal(
    <Command
      label={mart ? 'Search fields' : 'Search Data Marts'}
      shouldFilter={false}
      // Monaco's unlayered focus CSS overrides the app's controls inside content widgets.
      className='border shadow-md focus:outline-hidden! [&_:focus]:outline-hidden!'
      data-description-mention-picker=''
      data-testid='data-mart-mention-picker'
      // Keep native list scrolling from reaching Monaco's wheel/touch handlers.
      onWheel={event => {
        event.stopPropagation();
      }}
      onTouchMove={event => {
        event.stopPropagation();
      }}
      onBlurCapture={event => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          dismiss();
        }
      }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          if (mart) back();
          else {
            dismiss();
            editor?.focus();
          }
        }
      }}
    >
      {mart && (
        <div className='flex items-center gap-2 border-b p-1'>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label='Back to Data Marts'
            onClick={back}
          >
            <ArrowLeft className='size-4' />
          </Button>
          <DataMartIconGlyph icon={mart.icon} className='size-4 shrink-0' />
          <span className='truncate text-sm'>{mart.title}</span>
        </div>
      )}
      <CommandInput
        ref={inputRef}
        value={search}
        onValueChange={setSearch}
        aria-label={mart ? 'Search fields' : 'Search Data Marts'}
        placeholder={mart ? 'Search fields by alias or name…' : 'Search Data Marts…'}
      />
      {note && !mart && <p className='text-muted-foreground border-b px-3 py-2 text-xs'>{note}</p>}
      {loading && (
        <div role='status' className='text-muted-foreground flex items-center gap-2 p-3 text-sm'>
          <Loader2 className='size-4 animate-spin' />
          {mart ? 'Loading fields…' : 'Loading Data Marts…'}
        </div>
      )}
      {error && (
        <p role='alert' className='text-destructive p-3 text-sm'>
          {error}
        </p>
      )}
      {!loading && !error && !(mart ? filteredFields.length : filteredMarts.length) && (
        <p className='text-muted-foreground p-3 text-sm'>
          {mart
            ? query
              ? 'No matching fields.'
              : 'No available output-schema fields.'
            : 'No matching published Data Marts.'}
        </p>
      )}
      <CommandList className='overscroll-contain'>
        {mart ? (
          <>
            {!query && (
              <CommandGroup>
                <CommandItem
                  value='link-entire-data-mart'
                  onSelect={() => {
                    insert(mart);
                  }}
                >
                  <DataMartIconGlyph icon={mart.icon} className='size-4' />
                  Link entire Data Mart
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading='Output schema fields'>
              {filteredFields.map(field => (
                <CommandItem
                  key={field.name}
                  value={field.name}
                  keywords={[field.alias]}
                  onSelect={() => {
                    insert(mart, field);
                  }}
                >
                  {field.calculated ? (
                    <Calculator className='size-4' />
                  ) : (
                    <Columns3 className='size-4' />
                  )}
                  <div className='min-w-0'>
                    <div className='truncate'>{field.alias}</div>
                    <div className='text-muted-foreground truncate text-xs'>
                      {field.name}
                      {field.calculated ? ' · Calculated field' : ''}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : (
          <CommandGroup heading='Published Data Marts'>
            {filteredMarts.map(reference => (
              <CommandItem
                key={reference.id}
                value={reference.id}
                keywords={[reference.title]}
                onSelect={() => {
                  if (!pickFields) {
                    insert(reference);
                    return;
                  }
                  setMart(reference);
                  setSearch('');
                  inputRef.current?.focus();
                }}
              >
                <DataMartIconGlyph icon={reference.icon} className='size-4' />
                <span className='min-w-0 flex-1 truncate'>{reference.title}</span>
                {pickFields && <ChevronRight className='size-4' />}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>,
    container
  );
}
