import { fireEvent, render, screen } from '@testing-library/react';
import { EditableText } from '@owox/ui/components/common/editable-text';
import { describe, expect, it, vi } from 'vitest';

/**
 * `EditableText` is a `@owox/ui` primitive with six consumers across this app — a schema field's
 * Name, Alias and Description among them, and the calculated field's formula. `packages/ui` carries
 * no test runner, so its keyboard contract is pinned from the only workspace that has one.
 *
 * What is pinned here is that the trigger is a CONTROL: reachable by Tab and operable by Enter and
 * Space. Radix's `PopoverTrigger asChild` contributes `onClick` and `aria-*` and nothing else, so a
 * bare `<div>` under it left every one of those cells unreachable without a mouse.
 */
describe('EditableText: the trigger is a keyboard-operable control', () => {
  it('exposes the trigger as a button, so it is reachable by Tab', () => {
    render(<EditableText value='ctr' onValueChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'ctr' });
    expect(trigger).toHaveAttribute('tabindex', '0');

    trigger.focus();
    expect(document.activeElement).toBe(trigger);
  });

  it.each(['Enter', ' '])('opens the editor on %s', key => {
    render(<EditableText value='ctr' onValueChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'ctr' });
    // A <div> fires no synthetic click from either key, so without an explicit handler the popover
    // never opens — which is the whole of "a keyboard user cannot create a Calculated Field".
    fireEvent.keyDown(trigger, { key });

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('swallows the Space that opened it, so the page does not scroll instead', () => {
    render(<EditableText value='ctr' onValueChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'ctr' });
    const prevented = !fireEvent.keyDown(trigger, { key: ' ' });

    expect(prevented).toBe(true);
  });

  it('leaves other keys alone — typing beside the cell must not open it', () => {
    render(<EditableText value='ctr' onValueChange={vi.fn()} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'ctr' }), { key: 'a' });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('still opens on a plain click, as every consumer has always relied on', () => {
    render(<EditableText value='ctr' onValueChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'ctr' }));

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  // An empty value renders the placeholder, and that is the case a new Calculated Field starts in:
  // the trigger has to be reachable and named there too, or the feature has no keyboard entry point
  // at all.
  it('names the trigger by its placeholder while the value is empty', () => {
    render(<EditableText value='' placeholder='Formula is required' onValueChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'Formula is required' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
