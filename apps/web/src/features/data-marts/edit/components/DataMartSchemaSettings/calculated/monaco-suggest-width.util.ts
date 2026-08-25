import type * as monaco from 'monaco-editor';

/**
 * Monaco's suggest widget is a fixed 430px, so a joined field's dotted path — the one thing the
 * analyst is reading the row for — is what gets ellipsised:
 * `users.organizations.billing_acco…`. This grows the widget to the width its rows actually need.
 *
 * Not CSS: the 430 is written as an INLINE width, so only `!important` could beat it — and the
 * sashes are positioned from the widget's internal `_size`, which a CSS override leaves at 430, so
 * the right edge stops being where the resize handle is. Monaco's own `preferredWidth` counts the
 * name alone and computes NARROWER than the default here, accounting for neither the icon, the type
 * nor the Data Mart column.
 *
 * So the width is measured from the rendered rows and applied through `ResizableHTMLElement.layout`,
 * which keeps `_size`, the sashes and the list in step. Which column gives way when a row still
 * exceeds the cap is settled in App.css.
 */

/** `getLayoutInfo().defaultSize` — what an open with no analyst-chosen size lays out at. */
const MONACO_DEFAULT_WIDTH = 430;
const MAX_WIDTH = 720;
const MAX_VIEWPORT_SHARE = 0.9;
/** The list's overlay scrollbar draws on top of the rows rather than beside them. */
const SCROLLBAR_ALLOWANCE = 10;

/** The parts of Monaco's `ResizableHTMLElement` this needs. */
interface ResizableWidget {
  size: { width: number; height: number };
  domNode: HTMLElement;
  layout: (height: number, width: number) => void;
}

interface SuggestWidgetHandle {
  element: ResizableWidget;
  /** Re-places the widget for its new size — without it a widened widget runs off the screen. */
  reposition: () => void;
}

function suggestWidgetOf(editor: monaco.editor.ICodeEditor): SuggestWidgetHandle | null {
  if (typeof editor.getContribution !== 'function') return null;
  const controller = editor.getContribution('editor.contrib.suggestController') as {
    widget?: {
      isInitialized?: boolean;
      value?: { element?: Partial<ResizableWidget>; _contentWidget?: { layout?: () => void } };
    };
  } | null;
  // Created lazily on first use, and `value` would force that creation — so ask, never trigger.
  const lazy = controller?.widget;
  if (!lazy?.isInitialized) return null;
  const element = lazy.value?.element;
  const contentWidget = lazy.value?._contentWidget;
  if (!element?.domNode || !element.size || typeof element.layout !== 'function') return null;
  // No way to re-place it means no widening either: growing a widget anchored near the right edge
  // without letting the editor move it leaves half the list past the window.
  if (typeof contentWidget?.layout !== 'function') return null;
  return { element: element as ResizableWidget, reposition: () => contentWidget.layout?.() };
}

/**
 * The width the widest rendered row needs to show everything it holds.
 *
 * Rows are absolutely positioned at `width: 100%`, so they never size to their content on their
 * own — `max-content` makes each shrink-wrap, which resolves the nested `overflow: hidden` and
 * `max-width` clamps inside it and lets the untruncated width be read off. Transient: every style
 * written here is removed before this returns.
 */
function naturalWidth(widget: HTMLElement): number {
  const rows = [...widget.querySelectorAll<HTMLElement>('.monaco-list-row')];
  if (rows.length === 0) return 0;
  const descriptions = rows.map(row =>
    row.querySelector<HTMLElement>('.contents > .main > .right')
  );
  for (const row of rows) row.style.width = 'max-content';
  for (const description of descriptions) if (description) description.style.maxWidth = 'none';
  let widest = 0;
  for (const row of rows) widest = Math.max(widest, row.offsetWidth);
  for (const row of rows) row.style.width = '';
  for (const description of descriptions) if (description) description.style.maxWidth = '';
  return widest;
}

/**
 * Sizes the suggest widget of `editor` to its content for as long as the editor lives.
 *
 * Only ever GROWS, and only while Monaco opened the widget at its own default width. Both rules
 * exist to leave a dragged size alone: Monaco persists one across opens, so re-measuring over it
 * would undo the analyst's drag on every keystroke.
 *
 * `host` is the editor's `overflowWidgetsDomNode`, which is what keeps this to the formula editor
 * — every other Monaco editor in the app renders its suggest widget elsewhere and is untouched.
 */
export function autoSizeSuggestWidget(editor: monaco.editor.ICodeEditor, host: HTMLElement) {
  if (typeof MutationObserver === 'undefined') return () => undefined;

  /** Decided once per open: whose width is on screen, Monaco's default or the analyst's. */
  let sizing: 'auto' | 'analyst' | null = null;
  let observedWidget: HTMLElement | null = null;

  const sync = () => {
    const handle = suggestWidgetOf(editor);
    if (!handle) return;
    const widget = handle.element;
    if (!host.contains(widget.domNode)) return;
    if (widget.domNode !== observedWidget) {
      observedWidget = widget.domNode;
      // The widget's own inline width and `visible` class; rows are covered by the host
      // observation below, which deliberately watches no attributes — measuring writes inline
      // styles on the rows, and observing those would re-enter this callback forever.
      observer.observe(observedWidget, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    if (!widget.domNode.classList.contains('visible')) {
      sizing = null;
      return;
    }
    sizing ??= Math.round(widget.size.width) === MONACO_DEFAULT_WIDTH ? 'auto' : 'analyst';
    if (sizing !== 'auto') return;

    const natural = naturalWidth(widget.domNode);
    if (natural === 0) return;
    const cap = Math.min(MAX_WIDTH, Math.round(window.innerWidth * MAX_VIEWPORT_SHARE));
    const target = Math.min(cap, Math.max(widget.size.width, natural + SCROLLBAR_ALLOWANCE));
    if (target <= widget.size.width) return;
    widget.layout(widget.size.height, target);
    handle.reposition();
  };

  const observer = new MutationObserver(sync);
  observer.observe(host, { childList: true, subtree: true, characterData: true });

  // A drag hands the width to the analyst mid-open; Monaco persists it, and the check above takes
  // over from the next open on.
  const onPointerDown = (event: Event) => {
    if ((event.target as HTMLElement | null)?.closest('.monaco-sash')) sizing = 'analyst';
  };
  host.addEventListener('pointerdown', onPointerDown, true);

  return () => {
    observer.disconnect();
    host.removeEventListener('pointerdown', onPointerDown, true);
  };
}
