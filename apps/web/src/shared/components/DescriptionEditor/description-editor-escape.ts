/**
 * Radix sheets handle Escape at the document before the editor's picker handles it.
 * Keep the sheet open while an active mention or Monaco completion menu handles Escape.
 */
export function preventSheetDismissWhileSuggesting(event: KeyboardEvent): void {
  if (!(event.target instanceof Element)) return;
  if (
    event.target.closest('[data-description-mention-picker]') ||
    event.target
      .closest('.monaco-editor')
      ?.querySelector('.suggest-widget.visible, [data-description-mention-picker]')
  ) {
    event.preventDefault();
  }
}
