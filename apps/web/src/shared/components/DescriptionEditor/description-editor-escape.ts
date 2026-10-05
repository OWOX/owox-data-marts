/**
 * Radix sheets handle Escape at the document before Monaco handles it.
 * Keep the sheet open while Monaco dismisses its completion menu.
 */
export function preventSheetDismissWhileSuggesting(event: KeyboardEvent): void {
  if (
    event.target instanceof Element &&
    event.target.closest('.monaco-editor')?.querySelector('.suggest-widget.visible')
  ) {
    event.preventDefault();
  }
}
