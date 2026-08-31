import { screen, fireEvent } from '@testing-library/react';

/**
 * Drives an EditableText cell: clicks the trigger (shown text or placeholder), types the
 * value into the popover's textarea, and clicks Apply. Mirrors the Output Schema cells.
 */
export function editCell(triggerText: string, value: string) {
  fireEvent.click(screen.getByText(triggerText));
  const editor = screen.getAllByRole('textbox').find(el => el.tagName === 'TEXTAREA');
  if (!editor) throw new Error('EditableText textarea not found');
  fireEvent.change(editor, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
}

/** Adds a parameter row and names it inline. There are two "Add Parameter" buttons (top + bottom,
 * like Output Schema); either appends a row, so click the first. Assumes the Parameters tab is open. */
export function addParameter(name: string) {
  fireEvent.click(screen.getAllByRole('button', { name: /add parameter/i })[0]);
  editCell('Parameter name', name);
}

/** Adds a field row (the Fields "+ Add" button) and names it inline via the EditableText cell. */
export function addField(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /add field/i }));
  editCell('Field name', name);
}
