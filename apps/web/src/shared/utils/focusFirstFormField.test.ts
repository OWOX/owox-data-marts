// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { focusFirstFormField } from './focusFirstFormField';

function dialog(html: string) {
  const el = document.createElement('div');
  el.tabIndex = -1;
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

function open(el: HTMLElement) {
  const event = new Event('focusScope.autoFocusOnMount', { cancelable: true });
  el.addEventListener(event.type, focusFirstFormField);
  el.dispatchEvent(event);
  return event;
}

describe('focusFirstFormField', () => {
  it('skips the promo inside the form and hidden or disabled fields', () => {
    const el = dialog(
      '<form><div><button id="row">Set it up with your AI assistant</button></div><input type="hidden"><input disabled><button id="type" role="combobox">Type</button><input id="name"></form>'
    );
    expect(open(el).defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('type');
  });

  it('focuses the dialog when the form has no field', () => {
    const el = dialog('<button id="copy">Copy</button><form></form>');
    expect(open(el).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el);
  });

  it('keeps the default focus while the dialog has no form', () => {
    const el = dialog('<button id="copy">Copy</button><div>Loading</div>');
    (document.activeElement as HTMLElement | null)?.blur();
    expect(open(el).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it('prefers an input after a section toggle button', () => {
    const el = dialog('<form><button id="toggle">General</button><input id="name"></form>');
    open(el);
    expect(document.activeElement?.id).toBe('name');
  });

  it('falls back to a button when the form has no input', () => {
    const el = dialog('<form><button id="toggle">General</button></form>');
    open(el);
    expect(document.activeElement?.id).toBe('toggle');
  });
});
