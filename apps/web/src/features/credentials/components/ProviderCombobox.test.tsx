import { fireEvent, render, screen, within } from '@testing-library/react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@owox/ui/components/sheet';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChatGPTIcon, ClaudeIcon, GeminiIcon, GitHubIcon, OpenRouterIcon } from '../../../shared';
import type { CredentialIcon } from '../types';
import { ProviderCombobox, type ProviderOption } from './ProviderCombobox';

const options: ProviderOption[] = [
  { id: 'github', displayName: 'GitHub', category: 'other' },
  { id: 'snowflake-password', displayName: 'Snowflake password', category: 'snowflake' },
  { id: 'openai', displayName: 'OpenAI', category: 'ai' },
  { id: 'snowflake-key-pair', displayName: 'Snowflake key pair', category: 'snowflake' },
  { id: 'aws-access-key', displayName: 'AWS access key', category: 'aws' },
];

// The nearest inline pointer-events up the tree: a modal Sheet sets `none` on body.
function pointerEventsAt(node: HTMLElement): string {
  for (let element: HTMLElement | null = node; element; element = element.parentElement) {
    if (element.style.pointerEvents) return element.style.pointerEvents;
  }
  return 'auto';
}

function positionerOf(listbox: HTMLElement): HTMLElement {
  const popup = listbox.closest<HTMLElement>('[data-slot="combobox-content"]');
  if (!popup?.parentElement) throw new Error('The list is not inside the combobox popup');
  return popup.parentElement;
}

// The first path of a reference render tells the brands apart.
function brandPath(Icon: ComponentType<{ size?: number }>): string | null | undefined {
  const { container, unmount } = render(<Icon size={16} />);
  const path = container.querySelector('path')?.getAttribute('d');
  unmount();
  return path;
}

function groupHeadings(listbox: HTMLElement): (string | null)[] {
  return within(listbox)
    .getAllByText(/^(AI|Google|AWS|Snowflake|Databricks|Other)$/)
    .filter(node => !node.closest('[role="option"]'))
    .map(node => node.textContent);
}

describe('ProviderCombobox', () => {
  it('groups providers by provider, AI first and Other last', async () => {
    render(<ProviderCombobox definitions={options} value='' onChange={vi.fn()} />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Provider' }), { button: 0 });

    const listbox = await screen.findByRole('listbox');
    expect(groupHeadings(listbox)).toEqual(['AI', 'AWS', 'Snowflake', 'Other']);
    expect(within(listbox).getAllByRole('option')).toHaveLength(5);
  });

  it('shows a provider of a group it does not know under Other', async () => {
    const unknown = { id: 'azure-key', displayName: 'Azure key', category: 'azure' } as never;
    render(<ProviderCombobox definitions={[unknown]} value='' onChange={vi.fn()} />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Provider' }), { button: 0 });

    const listbox = await screen.findByRole('listbox');
    expect(groupHeadings(listbox)).toEqual(['Other']);
    expect(within(listbox).getByRole('option', { name: 'Azure key' })).toBeInTheDocument();
  });

  it('shows the icon key of a provider and a key icon when there is none', async () => {
    render(
      <ProviderCombobox
        definitions={[
          { id: 'aws-access-key', displayName: 'AWS access key', category: 'aws', icon: 'aws' },
          { id: 'custom-api', displayName: 'Custom API', category: 'other', icon: null },
        ]}
        value=''
        onChange={vi.fn()}
      />
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Provider' }), { button: 0 });

    const aws = await screen.findByRole('option', { name: 'AWS access key' });
    const custom = screen.getByRole('option', { name: 'Custom API' });
    expect(aws.querySelector('svg')).not.toHaveClass('lucide-key-round');
    expect(custom.querySelector('svg')).toHaveClass('lucide-key-round');
    expect(aws.querySelector('svg')).toHaveAttribute('width', '16');
    expect(custom.querySelector('svg')).toHaveAttribute('width', '16');
  });

  it('shows the BigQuery icon for both Google providers, which reach only BigQuery', async () => {
    render(
      <ProviderCombobox
        definitions={[
          {
            id: 'google-oauth',
            displayName: 'BigQuery Google account',
            category: 'google',
            icon: 'google',
          },
          {
            id: 'google-service-account',
            displayName: 'BigQuery Service Account',
            category: 'google',
            icon: 'google',
          },
        ]}
        value=''
        onChange={vi.fn()}
      />
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Provider' }), { button: 0 });

    // The blue hexagon of the BigQuery icon.
    const hexagon = 'path[fill="#4486FA"]';
    const account = await screen.findByRole('option', { name: 'BigQuery Google account' });
    expect(account.querySelector(hexagon)).not.toBeNull();
    expect(
      screen.getByRole('option', { name: 'BigQuery Service Account' }).querySelector(hexagon)
    ).not.toBeNull();
  });

  it('shows the brand icon of each AI provider and GitHub', async () => {
    const branded: [ProviderOption, ComponentType<{ size?: number }>][] = [
      [{ id: 'openai', displayName: 'OpenAI', category: 'ai', icon: 'openai' }, ChatGPTIcon],
      [
        { id: 'anthropic', displayName: 'Anthropic', category: 'ai', icon: 'anthropic' },
        ClaudeIcon,
      ],
      [{ id: 'gemini', displayName: 'Google Gemini', category: 'ai', icon: 'gemini' }, GeminiIcon],
      [
        { id: 'openrouter', displayName: 'OpenRouter', category: 'ai', icon: 'openrouter' },
        OpenRouterIcon,
      ],
      [{ id: 'github', displayName: 'GitHub', category: 'other', icon: 'github' }, GitHubIcon],
    ];
    const expected = branded.map(([, Icon]) => brandPath(Icon));
    render(
      <ProviderCombobox
        definitions={branded.map(([option]) => option)}
        value=''
        onChange={vi.fn()}
      />
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Provider' }), { button: 0 });

    await screen.findByRole('listbox');
    const icons = branded.map(([{ displayName }]) =>
      screen.getByRole('option', { name: displayName }).querySelector('svg')
    );
    for (const icon of icons) expect(icon).toHaveAttribute('width', '16');
    expect(icons.map(icon => icon?.querySelector('path')?.getAttribute('d'))).toEqual(expected);
  });

  it('shows a key icon for an icon key this build does not know', async () => {
    render(
      <ProviderCombobox
        definitions={[
          {
            id: 'future',
            displayName: 'Future provider',
            category: 'other',
            icon: 'future-brand' as CredentialIcon,
          },
        ]}
        value=''
        onChange={vi.fn()}
      />
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Provider' }), { button: 0 });

    const option = await screen.findByRole('option', { name: 'Future provider' });
    expect(option.querySelector('svg')).toHaveClass('lucide-key-round');
  });

  it('hides every provider icon from assistive technology', async () => {
    const icons: CredentialIcon[] = ['openai', 'anthropic', 'gemini', 'openrouter', 'github'];
    render(
      <ProviderCombobox
        definitions={[
          ...icons.map(icon => ({ id: icon, displayName: icon, category: 'ai' as const, icon })),
          { id: 'custom-api', displayName: 'Custom API', category: 'other', icon: null },
        ]}
        value=''
        onChange={vi.fn()}
      />
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Provider' }), { button: 0 });

    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options).toHaveLength(icons.length + 1);
    for (const option of options) {
      expect(option.querySelector('svg')?.parentElement).toHaveAttribute('aria-hidden', 'true');
      expect(within(option).queryByRole('img')).toBeNull();
    }
  });

  it('shows the icon of the selected provider in the field', () => {
    const definitions: ProviderOption[] = [
      { id: 'aws-access-key', displayName: 'AWS access key', category: 'aws', icon: 'aws' },
    ];
    const fieldIcon = () =>
      screen
        .getByRole('combobox', { name: 'Provider' })
        .closest('[data-slot="input-group"]')
        ?.querySelector('[data-align="inline-start"] svg');

    const { rerender } = render(
      <ProviderCombobox definitions={definitions} value='' onChange={vi.fn()} />
    );
    expect(fieldIcon()).toBeFalsy();

    rerender(
      <ProviderCombobox definitions={definitions} value='aws-access-key' onChange={vi.fn()} />
    );
    expect(fieldIcon()).toHaveAttribute('width', '16');
    expect(fieldIcon()?.getAttribute('class') ?? '').not.toContain('lucide-key-round');
  });

  it('narrows the list by search', async () => {
    render(<ProviderCombobox definitions={options} value='' onChange={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Provider' });
    fireEvent.mouseDown(input, { button: 0 });
    fireEvent.change(input, { target: { value: 'snow' } });

    const items = await screen.findAllByRole('option');
    expect(items.map(item => item.textContent)).toEqual([
      'Snowflake password',
      'Snowflake key pair',
    ]);
  });

  it('finds every provider of a group by the group name', async () => {
    render(
      <ProviderCombobox
        definitions={[
          ...options,
          {
            id: 'google-service-account',
            displayName: 'BigQuery Service Account',
            category: 'google',
          },
        ]}
        value=''
        onChange={vi.fn()}
      />
    );
    const input = screen.getByRole('combobox', { name: 'Provider' });
    fireEvent.mouseDown(input, { button: 0 });
    fireEvent.change(input, { target: { value: 'google' } });

    const items = await screen.findAllByRole('option');
    expect(items.map(item => item.textContent)).toEqual(['BigQuery Service Account']);
  });

  it('reports the picked provider', async () => {
    const onChange = vi.fn();
    render(<ProviderCombobox definitions={options} value='' onChange={onChange} />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Provider' }), { button: 0 });
    fireEvent.click(await screen.findByRole('option', { name: 'OpenAI' }));

    expect(onChange).toHaveBeenCalledWith('openai');
  });

  it('keeps the list open on a press on the provider icon in the field', async () => {
    const definitions: ProviderOption[] = [
      { id: 'aws-access-key', displayName: 'AWS access key', category: 'aws', icon: 'aws' },
    ];
    render(
      <ProviderCombobox definitions={definitions} value='aws-access-key' onChange={vi.fn()} />
    );
    const input = screen.getByRole('combobox', { name: 'Provider' });
    fireEvent.mouseDown(input, { button: 0 });
    await screen.findByRole('listbox');

    const icon = input
      .closest('[data-slot="input-group"]')
      ?.querySelector('[data-align="inline-start"]');
    if (!icon) throw new Error('The field shows no provider icon');
    fireEvent.pointerDown(icon, { button: 0, pointerType: 'mouse' });
    fireEvent.mouseDown(icon, { button: 0 });

    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('outside a modal, keeps the list clickable and leaves body pointer events alone', async () => {
    render(<ProviderCombobox definitions={options} value='' onChange={vi.fn()} />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Provider' }), { button: 0 });

    expect(positionerOf(await screen.findByRole('listbox')).style.pointerEvents).toBe('auto');
    expect(document.body.style.pointerEvents).toBe('');
  });

  it('stops the closing list from taking clicks', async () => {
    render(<ProviderCombobox definitions={options} value='' onChange={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Provider' });
    fireEvent.mouseDown(input, { button: 0 });
    const positioner = positionerOf(await screen.findByRole('listbox'));

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(positioner).toBeInTheDocument();
    expect(positioner.style.pointerEvents).toBe('none');
  });

  describe('inside a modal Sheet', () => {
    const openInSheet = async () => {
      render(
        <Sheet open>
          <SheetContent>
            <SheetTitle>Add Credential</SheetTitle>
            <SheetDescription>Pick a provider</SheetDescription>
            <ProviderCombobox definitions={options} value='' onChange={vi.fn()} />
          </SheetContent>
        </Sheet>
      );
      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Provider' }), { button: 0 });
      return screen.findByRole('option', { name: 'OpenAI' });
    };

    it('keeps the list clickable', async () => {
      const option = await openInSheet();

      expect(document.body.style.pointerEvents).toBe('none');
      expect(pointerEventsAt(option)).toBe('auto');
    });

    it('lets the wheel scroll the list', async () => {
      const option = await openInSheet();
      const wheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
      option.dispatchEvent(wheel);

      expect(wheel.defaultPrevented).toBe(false);
    });

    it.each([
      ['wheel', fireEvent.wheel],
      ['touchmove', fireEvent.touchMove],
    ])('keeps a %s on the list from the scroll lock on document', async (type, fire) => {
      const option = await openInSheet();
      const spy = vi.fn();
      document.addEventListener(type, spy);
      try {
        fire(option);
      } finally {
        document.removeEventListener(type, spy);
      }

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
