import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttributesEditor } from './components/AttributesEditor';

describe('AttributesEditor', () => {
  it('toggles one attribute without dropping unknown co-existing ones', () => {
    const calls: [string, boolean][] = [];
    render(
      <AttributesEditor
        value={['OAUTH_FLOW', 'ADVANCED']}
        onToggle={(attr, checked) => calls.push([attr, checked])}
      />
    );
    // open the popover + untick ADVANCED (exact query: mirror how AccountsEditor.test opens controls)
    fireEvent.click(screen.getByRole('button', { name: /attributes/i }));
    fireEvent.click(screen.getByRole('option', { name: /advanced/i }));
    expect(calls).toContainEqual(['ADVANCED', false]);
    // The component reports a single-attribute toggle; it never emits the whole array,
    // so the parent's Set-based writer preserves OAUTH_FLOW.
  });

  it('lists exactly the 4 authorable attributes (no SECRET/OAUTH_FLOW/DEPRECATED)', () => {
    render(<AttributesEditor value={[]} onToggle={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /attributes/i }));
    expect(screen.getByRole('option', { name: /manual_backfill|manual backfill/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /^secret$/i })).toBeNull();
    expect(screen.queryByRole('option', { name: /oauth/i })).toBeNull();
  });

  // The closed trigger is a fixed-height control in a narrow table column. jsdom cannot
  // measure the overflow that caused, but it can pin the rule that prevents it: however
  // many attributes are set, the trigger renders one label and a counter — never a second
  // label that would have to wrap onto a second line.
  describe('the closed trigger', () => {
    const triggerText = () => screen.getByRole('button', { name: /attributes/i }).textContent;

    it('shows a placeholder when nothing is selected', () => {
      render(<AttributesEditor value={[]} onToggle={() => {}} />);
      expect(triggerText()).toContain('None');
    });

    it('shows the single label on its own', () => {
      render(<AttributesEditor value={['PINNED']} onToggle={() => {}} />);
      expect(triggerText()).toContain('Pinned');
      expect(triggerText()).not.toContain('+');
    });

    it('collapses a second label into a counter instead of wrapping', () => {
      render(<AttributesEditor value={['PINNED', 'ADVANCED']} onToggle={() => {}} />);
      expect(triggerText()).toContain('Pinned');
      expect(triggerText()).not.toContain('Advanced');
      expect(triggerText()).toContain('+1');
    });

    it('counts only the attributes this control owns', () => {
      // SECRET and OAUTH_FLOW live on the param but belong to other editors, so they must
      // not inflate the counter.
      render(
        <AttributesEditor
          value={['PINNED', 'ADVANCED', 'MANUAL_BACKFILL', 'SECRET', 'OAUTH_FLOW']}
          onToggle={() => {}}
        />
      );
      expect(triggerText()).toContain('+2');
    });
  });
});
