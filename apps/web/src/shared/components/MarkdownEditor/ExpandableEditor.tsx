import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogTitle } from '@owox/ui/components/dialog';
import { isInsideIgnoredDismissPortal } from '@owox/ui/lib/dismissable-portals';

interface ExpandableEditorProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  title: string;
  focusTargetRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onEscapeKeyDown?: ComponentProps<typeof DialogContent>['onEscapeKeyDown'];
  children: ReactNode;
}

/** Move the same description content into the dialog, including any Monaco model and history. */
export function ExpandableEditor({
  expanded,
  onExpandedChange,
  title,
  focusTargetRef,
  returnFocusRef,
  onEscapeKeyDown,
  children,
}: ExpandableEditorProps) {
  const [host] = useState(() => {
    const node = document.createElement('div');
    node.className = 'flex min-h-0 min-w-0 flex-1 flex-col';
    return node;
  });
  const insidePointerEvents = useRef(new WeakSet<Event>());
  const inlineSlot = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && !expanded) node.append(host);
    },
    [expanded, host]
  );
  const fullscreenSlot = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && expanded) node.append(host);
    },
    [expanded, host]
  );
  const focusContent = (event: Event) => {
    const target =
      focusTargetRef?.current ?? host.querySelector<HTMLTextAreaElement>('textarea.inputarea');
    if (target) {
      event.preventDefault();
      target.focus();
    }
  };
  useEffect(() => {
    if (!expanded) return;
    // Monaco handles Escape before Radix's document listener. Collapse first,
    // so the same key cannot cancel the draft or dismiss a surrounding Sheet.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !(event.target instanceof Node) || !host.contains(event.target))
        return;
      onEscapeKeyDown?.(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onExpandedChange(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      // A menu update can replace the target before Radix checks the event.
      if (
        (event.target instanceof Node && host.contains(event.target)) ||
        isInsideIgnoredDismissPortal(event.target)
      )
        insidePointerEvents.current.add(event);
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [expanded, host, onEscapeKeyDown, onExpandedChange]);

  return (
    <>
      <div ref={inlineSlot} className='min-w-0' />
      <Dialog open={expanded} onOpenChange={onExpandedChange}>
        <DialogContent
          className='inset-0 top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-4 sm:max-w-none'
          showCloseButton={false}
          aria-describedby={undefined}
          onOpenAutoFocus={focusContent}
          onCloseAutoFocus={event => {
            if (returnFocusRef?.current) {
              event.preventDefault();
              returnFocusRef.current.focus();
            } else focusContent(event);
          }}
          onInteractOutside={event => {
            // The editor's stable React portal is owned outside Dialog even
            // while its DOM is inside it. Treat those interactions as inside.
            const target = event.detail.originalEvent.target;
            if (
              isInsideIgnoredDismissPortal(target) ||
              (target instanceof Node && host.contains(target)) ||
              insidePointerEvents.current.has(event.detail.originalEvent)
            )
              event.preventDefault();
          }}
          onEscapeKeyDown={event => {
            onEscapeKeyDown?.(event);
            if (event.defaultPrevented) return;
            event.preventDefault();
            event.stopPropagation();
            onExpandedChange(false);
          }}
        >
          <DialogTitle className='sr-only'>{title}</DialogTitle>
          <div ref={fullscreenSlot} className='flex min-h-0 flex-1 flex-col' />
        </DialogContent>
      </Dialog>
      {createPortal(children, host)}
    </>
  );
}
