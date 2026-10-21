import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sheet, SheetContent, SheetTitle } from '@owox/ui/components/sheet';
import { DescriptionView } from './DescriptionView';
import { useDescriptionPreview } from './useDescriptionPreview';
import { trackEvent } from '../../../utils/data-layer';

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('./useDescriptionPreview', () => ({ useDescriptionPreview: vi.fn() }));
vi.mock('../../../utils/data-layer', () => ({ trackEvent: vi.fn() }));

const value =
  '# Revenue\n\n[Orders · Net revenue](/ui/project/data-marts/orders/data-setup?field=net_revenue)';
const html =
  '<h1>Revenue</h1><a href="/ui/project/data-marts/orders/data-setup?field=net_revenue">Orders · Net revenue</a>';

describe('business description reading state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDescriptionPreview).mockReturnValue({ html, loading: false, error: null });
  });

  it('shows formatted content on first open without a mode switch and preserves sandboxed links', () => {
    render(<DescriptionView projectId='project' value={value} scope='context' />);
    const frame = screen.getByTitle('Description');
    expect(frame).toHaveAttribute('srcdoc', expect.stringContaining(html));
    expect(frame).toHaveAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });

  it.each(['project', 'context', 'data_mart'] as const)(
    'copies the exact Markdown and tracks only the %s surface',
    async scope => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
      const onEdit = vi.fn();
      render(<DescriptionView projectId='project' value={value} scope={scope} onEdit={onEdit} />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy as Markdown' }));
      await screen.findByRole('button', { name: 'Copied as Markdown' });
      expect(writeText).toHaveBeenCalledWith(value);
      expect(trackEvent).toHaveBeenCalledWith({
        event: 'description_copy',
        category: 'Description',
        action: 'Copy',
        label: scope,
      });
      fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
      expect(onEdit).toHaveBeenCalledOnce();
      expect(trackEvent).toHaveBeenLastCalledWith({
        event: 'description_edit',
        category: 'Description',
        action: 'Edit',
        label: scope,
      });
    }
  );

  it('allows copying in read-only state and reports clipboard denial without claiming success', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Permission denied'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<DescriptionView projectId='project' value={value} scope='project' />);
    expect(screen.queryByRole('button', { name: 'Edit description' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy as Markdown' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Copied as Markdown' })).not.toBeInTheDocument();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it.each(['project', 'context', 'data_mart'] as const)(
    'expands the formatted %s description without opening the editor',
    async scope => {
      const onEdit = vi.fn();
      render(<DescriptionView projectId='project' value={value} scope={scope} onEdit={onEdit} />);
      const frame = screen.getByTitle('Description');
      const expand = screen.getByRole('button', { name: 'Expand description' });
      fireEvent.click(expand);
      await screen.findByRole('dialog', { name: 'Description' });
      expect(screen.getByTitle('Description')).toBe(frame);
      expect(frame).toHaveAttribute('srcdoc', expect.stringContaining(html));
      expect(onEdit).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy as Markdown' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(screen.getByTitle('Description')).toBe(frame);
      expect(expand).toHaveFocus();
    }
  );

  it('lets a read-only user collapse full-screen reading without dismissing the Context sheet', async () => {
    const onSheetChange = vi.fn();
    render(
      <Sheet open onOpenChange={onSheetChange}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Context details</SheetTitle>
          <DescriptionView projectId='project' value={value} scope='context' />
        </SheetContent>
      </Sheet>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand description' }));
    await screen.findByRole('dialog', { name: 'Description' });
    const exit = screen.getByRole('button', { name: 'Exit full screen' });
    expect(exit).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Edit description' })).not.toBeInTheDocument();
    fireEvent.keyDown(exit, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Description' })).not.toBeInTheDocument();
    });
    expect(onSheetChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Context details' })).toBeInTheDocument();
  });

  it('closes full-screen reading when editing starts', async () => {
    const onEdit = vi.fn();
    render(<DescriptionView projectId='project' value={value} scope='project' onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand description' }));
    await screen.findByRole('dialog', { name: 'Description' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
    expect(onEdit).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('keeps text visible while formatting loads or fails, then displays the completed content', async () => {
    vi.mocked(useDescriptionPreview).mockReturnValue({ html: '', loading: true, error: null });
    const view = render(<DescriptionView projectId='project' value={value} scope='context' />);
    expect(screen.getByText(/# Revenue/)).toBeInTheDocument();
    vi.mocked(useDescriptionPreview).mockReturnValue({
      html: '',
      loading: false,
      error: 'offline',
    });
    view.rerender(<DescriptionView projectId='project' value={value} scope='context' />);
    expect(screen.getByText(/# Revenue/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('shown as text');
    vi.mocked(useDescriptionPreview).mockReturnValue({ html, loading: false, error: null });
    view.rerender(<DescriptionView projectId='project' value={value} scope='context' />);
    await waitFor(() => {
      expect(screen.getByTitle('Description')).toBeInTheDocument();
    });
  });

  it('provides an empty description state and prevents editing while the form saves', () => {
    vi.mocked(useDescriptionPreview).mockReturnValue({ html: '', loading: false, error: null });
    const onEdit = vi.fn();
    render(
      <DescriptionView projectId='project' value='' scope='context' onEdit={onEdit} disabled />
    );
    expect(screen.getByText('No description yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy as Markdown' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit description' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
    expect(onEdit).not.toHaveBeenCalled();
  });
});
